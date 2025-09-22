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

    const user = req.user; // comes from authenticate middleware
    console.log('User from middleware:', user);

    // Fetch property from DB
    const property = await Property.findById(id)
      .select('title titleAr location images status financials analytics fundingProgress createdBy isActive')
      .populate('createdBy', 'firstName lastName email')
      .lean();

    console.log('Property fetched from DB:', property);

    if (!property || !property.isActive) {
      console.log('Property not found or inactive');
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    // If user KYC not approved → return partial info
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

    // Increment views for approved users
    await Property.findByIdAndUpdate(id, { $inc: { 'analytics.views': 1 } });
    console.log('Views incremented for property');

    // Return full property details
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

      // Match stage
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

      // Add relevance score for text search
      if (q) {
        aggregationPipeline.push({
          $addFields: { relevanceScore: { $meta: 'textScore' } }
        });
      }

      // Sort stage
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

      // Pagination
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
        const { shares, amount, paymentMethod = 'mada' } = req.body;
        const userId = req.user.id;

        const property = await Property.findById(id).session(session);
        if (!property || property.status !== 'active') {
          throw new Error('Property not available for investment');
        }

        // Check available shares
        if (shares > property.financials.availableShares) {
          throw new Error(`Only ${property.financials.availableShares} shares available`);
        }

        // Validate amount calculation
        const expectedAmount = shares * property.financials.pricePerShare;
        if (Math.abs(amount - expectedAmount) > 0.01) {
          throw new Error('Investment amount does not match share calculation');
        }

        // Check user KYC
        const user = await User.findById(userId).session(session);
        if (user.kycStatus !== 'approved') {
          throw new Error('KYC verification required');
        }

        // Create investment
        const investment = new Investment({
          user: userId,
          property: id,
          shares,
          amount,
          pricePerShare: property.financials.pricePerShare,
          paymentDetails: {
            paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            paymentMethod,
            transactionId: `TXN_${Date.now()}`
          },
          status: 'confirmed' // In real app, this would be 'pending' until payment confirmation
        });

        // Update property
        property.financials.availableShares -= shares;
        property.investorCount += 1;

        // Save changes
        await Promise.all([
          investment.save({ session }),
          property.save({ session })
        ]);

        res.json({
          success: true,
          message: 'Investment successful',
          data: {
            investmentId: investment._id,
            transactionId: investment.paymentDetails.transactionId,
            shares,
            amount,
            remainingShares: property.financials.availableShares
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