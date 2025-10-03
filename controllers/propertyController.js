const Property = require('../models/Property');
const Investment = require('../models/Investment');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

class PropertyController {
  
  async getAllProperties(req, res) {
  try {
    const { page = 1, limit = 12, city, propertyType } = req.query;

    const filter = { isActive: true, status: 'active' };
    if (city) filter['location.city'] = city;
    if (propertyType) filter.propertyType = propertyType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const userId = req.user?.id;
    let user = null;
    if (userId) {
      user = await User.findById(userId).select('kycStatus').lean();
    }

   
    const baseFields = 'title titleAr location images status';
    const fullFields = baseFields + ' financials fundingProgress investorCount analytics';

    const properties = await Property.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select(user?.kycStatus === 'approved' ? fullFields : baseFields)
      .lean();

    const total = await Property.countDocuments(filter);

    res.json({
      success: true,
      data: {
        properties,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total
        },
        accountVerificationRequired: user && user.kycStatus !== 'approved'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching properties',
      error: error.message
    });
  }
}


 async getPropertyById(req, res) {
  try {
    const { id } = req.params;
    console.log('Requested property ID:', id);

    const user = req.user; 
    console.log('User from middleware:', user);

    const property = await Property.findById(id)
      .select('title titleAr location images status financials analytics fundingProgress createdBy isActive')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    console.log('Property fetched from DB:', property);

    if (!property || !property.isActive) {
      console.log('Property not found or inactive');
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    if (!user || user.kycStatus !== 'approved') {
      console.log('KYC not approved');
      return res.status(403).json({
        success: false,
        message: 'Account Verification Required. Complete your KYC to see full property details.',
        property: {
          title: property.title,
          titleAr: property.titleAr,
          location: property.location,
          images: property.images,
          status: property.status
        },
        redirect: '/api/kyc/upload'
      });
    }

    await Property.findByIdAndUpdate(id, { $inc: { 'analytics.views': 1 } });
    console.log('Views incremented for property');

    res.json({
      success: true,
      data: property
    });

  } catch (error) {
    console.error('Error in getPropertyById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching property',
      error: error.message
    });
  }
}


  async searchProperties(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const {
        q,
        city,
        propertyType,
        minInvestment,
        maxInvestment,
        minYield,
        sortBy = 'relevance',
        page = 1,
        limit = 12
      } = req.query;

      let aggregationPipeline = [];

      const matchStage = {
        isActive: true,
        status: { $in: ['active', 'fully_funded'] }
      };

      if (q) matchStage.$text = { $search: q };
      if (city) matchStage['location.city'] = city;
      if (propertyType) matchStage.propertyType = propertyType;
      if (minInvestment) matchStage['financials.minInvestment'] = { $gte: parseFloat(minInvestment) };
      if (maxInvestment) matchStage['financials.minInvestment'] = { ...matchStage['financials.minInvestment'], $lte: parseFloat(maxInvestment) };
      if (minYield) matchStage['financials.projectedYield'] = { $gte: parseFloat(minYield) };

      aggregationPipeline.push({ $match: matchStage });

      if (q) {
        aggregationPipeline.push({
          $addFields: { relevanceScore: { $meta: 'textScore' } }
        });
      }

      let sortStage = {};
      if (q && sortBy === 'relevance') {
        sortStage = { relevanceScore: { $meta: 'textScore' } };
      } else {
        switch (sortBy) {
          case 'yield_high':
            sortStage = { 'financials.projectedYield': -1 };
            break;
          case 'yield_low':
            sortStage = { 'financials.projectedYield': 1 };
            break;
          case 'price_high':
            sortStage = { 'financials.minInvestment': -1 };
            break;
          case 'price_low':
            sortStage = { 'financials.minInvestment': 1 };
            break;
          default:
            sortStage = { createdAt: -1 };
        }
      }

      aggregationPipeline.push({ $sort: sortStage });

      aggregationPipeline.push({
        $facet: {
          data: [
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
          ],
          count: [{ $count: 'total' }]
        }
      });

      const [result] = await Property.aggregate(aggregationPipeline);
      const properties = result.data;
      const total = result.count[0]?.total || 0;

      res.json({
        success: true,
        data: {
          properties,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          },
          searchQuery: q
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error searching properties',
        error: error.message
      });
    }
  }
async investInProperty(req, res) {
  const session = await mongoose.startSession();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    await session.withTransaction(async () => {
      const { id } = req.params;
      const { units, shares, paymentMethod = 'mada' } = req.body;
      const userId = req.user.id;

      const property = await Property.findById(id).session(session);
      if (!property || property.status !== 'active') {
        throw new Error('Property not available for investment');
      }

      console.log('Property financials:', JSON.stringify(property.financials, null, 2));

      const requestedUnits = units || shares;

      if (!requestedUnits || requestedUnits < 1) {
        throw new Error('Units/shares are required. Please specify how many units you want to purchase.');
      }

      if (!property.financials.pricePerShare || property.financials.pricePerShare <= 0) {
        throw new Error(`Invalid price per share: ${property.financials.pricePerShare}. Property needs to have a valid price per share set.`);
      }

      // Calculate total amount based on units
      const totalAmount = requestedUnits * property.financials.pricePerShare;

      // Check if user can afford the minimum investment
      const minUnitsRequired = Math.ceil(property.financials.minInvestment / property.financials.pricePerShare);
      if (requestedUnits < minUnitsRequired) {
        throw new Error(
          `Minimum investment requires ${minUnitsRequired} units (${property.financials.minInvestment} SAR). ` +
          `You requested ${requestedUnits} units (${totalAmount} SAR).`
        );
      }

      if (requestedUnits > property.financials.availableShares) {
        throw new Error(`Only ${property.financials.availableShares} units available`);
      }

      const user = await User.findById(userId).session(session);
      if (user.kycStatus !== 'approved') {
        throw new Error('KYC verification required');
      }

      // Create investment - user is buying units directly from the property
      const investment = new Investment({
        user: userId,
        property: id,
        shares: requestedUnits,
        amount: totalAmount,
        pricePerShare: property.financials.pricePerShare,
        paymentDetails: {
          paymentMethod: 'fake',
          isFakePayment: true
        },
        status: 'confirmed'
      });

      // Update user's wallet
      user.wallet.totalUnitsOwned = (user.wallet.totalUnitsOwned || 0) + requestedUnits;
      user.wallet.totalInvested = (user.wallet.totalInvested || 0) + totalAmount;

      // Update investment summary
      user.investmentSummary.totalInvested = (user.investmentSummary.totalInvested || 0) + totalAmount;
      user.investmentSummary.lastInvestmentDate = new Date();

      // Save investment first
      await investment.save({ session });

      // Count unique properties user has invested in
      const uniqueProperties = await Investment.distinct('property', {
        user: userId,
        status: 'confirmed'
      }).session(session);

      user.investmentSummary.propertyCount = uniqueProperties.length;

      // Check if this is user's first investment in this property for investor count
      const investmentsInThisProperty = await Investment.countDocuments({
        user: userId,
        property: id,
        status: 'confirmed'
      }).session(session);

      const isNewInvestor = investmentsInThisProperty === 1; // Only 1 means this is the first

      // Deduct units from property's available shares
      property.financials.availableShares -= requestedUnits;
      if (isNewInvestor) {
        property.investorCount += 1;
      }

      await Promise.all([
        property.save({ session }),
        user.save({ session })
      ]);

      res.json({
        success: true,
        message: `Successfully purchased ${requestedUnits} units`,
        data: {
          investmentId: investment._id,
          unitsPurchased: requestedUnits,
          totalAmountPaid: totalAmount,
          pricePerUnit: property.financials.pricePerShare,
          propertyRemainingUnits: property.financials.availableShares,
          userSummary: {
            totalUnitsOwned: user.wallet.totalUnitsOwned,
            totalInvested: user.wallet.totalInvested,
            propertyCount: user.investmentSummary.propertyCount
          }
        }
      });
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Investment failed'
    });
  } finally {
    await session.endSession();
  }
}
}
module.exports = new PropertyController();