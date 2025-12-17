const Property = require('../models/Property');
const Investment = require('../models/Investment');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { calculateWithdrawalAmount, calculateInvestmentReturns } = require('../utils/investment-calculations');

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
      .select('title titleAr location images status financials analytics fundingProgress investmentTerms createdBy isActive')
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
      const { units, shares, paymentMethod = 'mada', investmentType = 'simple_annual' } = req.body;
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

      // Calculate management fee if applicable
      let managementFeeAmount = 0;
      let managementFeePercentage = 0;
      let netInvestmentAmount = totalAmount;

      if (property.managementFees && property.managementFees.isActive && property.managementFees.percentage > 0) {
        managementFeePercentage = property.managementFees.percentage;
        managementFeeAmount = (totalAmount * managementFeePercentage) / 100;
        netInvestmentAmount = totalAmount - managementFeeAmount;
      }

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

      // Calculate investment dates based on investment type
      const investmentDate = new Date();
      let lockInEndDate = null;
      let bondMaturityDate = null;
      let lockingPeriodYears = null;
      let bondMaturityYears = null;
      let isInLockInPeriod = false;
      let graduatedPenalties = [];

      // For bond investments, set up lock-in and maturity dates
      if (investmentType === 'bond') {
        lockingPeriodYears = property.investmentTerms?.lockingPeriodYears || 3; // Default 3 years
        bondMaturityYears = property.investmentTerms?.bondMaturityYears || lockingPeriodYears + 2; // Default: lock-in + 2 years

        lockInEndDate = new Date(investmentDate);
        lockInEndDate.setFullYear(lockInEndDate.getFullYear() + lockingPeriodYears);

        bondMaturityDate = new Date(investmentDate);
        bondMaturityDate.setFullYear(bondMaturityDate.getFullYear() + bondMaturityYears);

        isInLockInPeriod = true;

        graduatedPenalties = property.investmentTerms?.graduatedPenalties || [
          { year: 1, penaltyPercentage: 30 },
          { year: 2, penaltyPercentage: 20 },
          { year: 3, penaltyPercentage: 10 }
        ];
      } else {
        // Simple annual investment: 1 year duration, no lock-in
        bondMaturityDate = new Date(investmentDate);
        bondMaturityDate.setFullYear(bondMaturityDate.getFullYear() + 1);
      }

      // Create investment - user is buying units directly from the property
      const investment = new Investment({
        user: userId,
        property: id,
        shares: requestedUnits,
        amount: totalAmount,
        pricePerShare: property.financials.pricePerShare,
        investmentType,
        managementFee: {
          feePercentage: managementFeePercentage,
          feeAmount: managementFeeAmount,
          netInvestment: netInvestmentAmount
        },
        // Investment terms snapshot (captured at investment time)
        investmentDate,
        lockInEndDate,
        bondMaturityDate,
        rentalYieldRate: property.investmentTerms?.rentalYieldRate || 8, // Default 8%
        appreciationRate: property.investmentTerms?.appreciationRate || 3, // Default 3%
        lockingPeriodYears,
        bondMaturityYears,
        graduatedPenalties,
        isInLockInPeriod,
        hasMatured: false,
        paymentDetails: {
          paymentMethod: 'fake',
          isFakePayment: true
        },
        status: 'confirmed'
      });

      // Update user's wallet (using original investment amount, not net)
      user.wallet.totalUnitsOwned = (user.wallet.totalUnitsOwned || 0) + requestedUnits;
      user.wallet.totalInvested = (user.wallet.totalInvested || 0) + totalAmount;

      // Update investment summary (using original investment amount, not net)
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

      // Track total management fees collected
      if (managementFeeAmount > 0) {
        property.managementFees.totalFeesCollected = (property.managementFees.totalFeesCollected || 0) + managementFeeAmount;
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
          investmentType,
          unitsPurchased: requestedUnits,
          totalAmountPaid: totalAmount,
          managementFee: {
            percentage: managementFeePercentage,
            amount: managementFeeAmount,
            netInvestment: netInvestmentAmount
          },
          investmentDetails: {
            investmentDate,
            lockInEndDate,
            bondMaturityDate,
            rentalYieldRate: investment.rentalYieldRate,
            appreciationRate: investment.appreciationRate,
            graduatedPenalties: investmentType === 'bond' ? graduatedPenalties : null
          },
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

  /**
   * Calculate investment returns and withdrawal amount
   * Shows current value, returns, and penalties if applicable
   */
  async calculateWithdrawal(req, res) {
    try {
      const { investmentId } = req.params;
      const userId = req.user.id;

      // Find the investment
      const investment = await Investment.findById(investmentId)
        .populate('property')
        .lean();

      if (!investment) {
        return res.status(404).json({
          success: false,
          message: 'Investment not found'
        });
      }

      // Verify ownership
      if (investment.user.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this investment'
        });
      }

      const property = investment.property;

      console.log('=== WITHDRAWAL CALCULATION DEBUG ===');
      console.log('Investment ID:', investment._id);
      console.log('Investment Type:', investment.investmentType);
      console.log('Investment Date:', investment.investmentDate);
      console.log('Lock-in End Date:', investment.lockInEndDate);
      console.log('Investment graduatedPenalties:', JSON.stringify(investment.graduatedPenalties, null, 2));
      console.log('Property graduatedPenalties:', JSON.stringify(property.investmentTerms?.graduatedPenalties, null, 2));
      console.log('Property managementFees:', JSON.stringify(property.managementFees, null, 2));

      const withdrawalDetails = calculateWithdrawalAmount(investment, property);

      console.log('Calculated Penalty Info:', JSON.stringify(withdrawalDetails.penalty, null, 2));
      console.log('Calculated Management Fee Info:', JSON.stringify(withdrawalDetails.managementFee, null, 2));
      console.log('Total Value:', withdrawalDetails.totalValue);
      console.log('Net Withdrawal Amount:', withdrawalDetails.netWithdrawalAmount);
      console.log('===================================');

      res.json({
        success: true,
        data: {
          investmentId: investment._id,
          investmentType: investment.investmentType,
          investmentAmount: investment.amount,
          netInvestmentAmount: investment.managementFee?.netInvestment || investment.amount,
          ...withdrawalDetails,
          canWithdrawWithoutPenalty: !withdrawalDetails.penalty.isInLockInPeriod
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error calculating withdrawal amount',
        error: error.message
      });
    }
  }

  /**
   * Get investment returns summary
   * Shows all returns without withdrawal penalty
   */
  async getInvestmentReturns(req, res) {
    try {
      const { investmentId } = req.params;
      const userId = req.user.id;

      const investment = await Investment.findById(investmentId)
        .populate('property')
        .lean();

      if (!investment) {
        return res.status(404).json({
          success: false,
          message: 'Investment not found'
        });
      }

      if (investment.user.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this investment'
        });
      }

      const property = investment.property;
      const returns = calculateInvestmentReturns(investment, property);

      res.json({
        success: true,
        data: {
          investmentId: investment._id,
          investmentType: investment.investmentType,
          ...returns
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error calculating investment returns',
        error: error.message
      });
    }
  }

  // Deactivate property
  async deactivateProperty(req, res) {
    try {
      const { id } = req.params;
      const { reason, comment } = req.body;
      const adminId = req.user?.id;

      const property = await Property.findByIdAndUpdate(
        id,
        {
          status: 'inactive',
          deactivatedAt: new Date(),
          deactivatedBy: adminId,
          deactivationReason: reason,
          deactivationComment: comment
        },
        { new: true }
      );

      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }

      logger.info(`Property deactivated: ${property.title} by admin ${adminId}`);

      res.json({
        success: true,
        message: 'Property deactivated successfully',
        data: property
      });
    } catch (error) {
      logger.error('Error deactivating property:', error);
      res.status(500).json({
        success: false,
        message: 'Error deactivating property',
        error: error.message
      });
    }
  }

  // Activate/Reactivate property
  async activateProperty(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;

      const property = await Property.findByIdAndUpdate(
        id,
        {
          status: 'active',
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          deactivationComment: null,
          reactivatedAt: new Date(),
          reactivatedBy: adminId
        },
        { new: true }
      );

      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }

      logger.info(`Property reactivated: ${property.title} by admin ${adminId}`);

      res.json({
        success: true,
        message: 'Property reactivated successfully',
        data: property
      });
    } catch (error) {
      logger.error('Error reactivating property:', error);
      res.status(500).json({
        success: false,
        message: 'Error reactivating property',
        error: error.message
      });
    }
  }
}
module.exports = new PropertyController();