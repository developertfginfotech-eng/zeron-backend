const express = require('express');
const router = express.Router();
const InvestmentSettings = require('../models/InvestmentSettings');
const Investment = require('../models/Investment');
const Property = require('../models/Property');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Get my investments (user's investments)
router.get('/my-investments', authenticate, async (req, res) => {
  try {
    const investments = await Investment.find({
      user: req.user.id,
      status: 'confirmed'
    })
    .populate('property', 'title titleAr financials location images status')
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      success: true,
      data: investments.map(inv => ({
        id: inv._id,
        _id: inv._id,
        propertyId: inv.property._id,
        propertyName: inv.property.title,
        amount: inv.amount,
        shares: inv.shares,
        status: inv.status,
        createdAt: inv.createdAt,
        investedAt: inv.createdAt,
        returns: inv.returns?.totalReturnsReceived || 0,
        rentalYieldRate: inv.rentalYieldRate || 0,
        appreciationRate: inv.appreciationRate || 0,
        penaltyRate: inv.penaltyRate || 0,
        maturityDate: inv.maturityDate,
        maturityPeriodYears: inv.maturityPeriodYears || 5,
        property: inv.property
      }))
    });
  } catch (error) {
    logger.error('Get my investments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching investments',
      error: error.message
    });
  }
});

// Create investment (POST /api/investments)
router.post('/',
  authenticate,
  [
    body('propertyId')
      .isMongoId()
      .withMessage('Invalid property ID'),
    body('amount')
      .isFloat({ min: 1000 })
      .withMessage('Minimum investment is SAR 1,000')
  ],
  async (req, res) => {
    try {
      const { propertyId, amount } = req.body;
      const userId = req.user.id;

      // Get property
      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }

      // Check if property is available for investment
      if (!['active', 'funding'].includes(property.status)) {
        return res.status(400).json({
          success: false,
          message: 'Property not available for investment'
        });
      }

      // Check minimum investment
      const minInvestment = property.financials.minInvestment || 1000;
      if (amount < minInvestment) {
        return res.status(400).json({
          success: false,
          message: `Minimum investment is SAR ${minInvestment}`
        });
      }

      // Get user and check wallet balance
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check wallet balance
      if ((user.wallet.balance || 0) < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance'
        });
      }

      // Calculate shares - based on minimum investment units
      // If pricePerShare is 0 or not set, use a default calculation
      let pricePerShare = property.financials.pricePerShare;
      let shares = 1;

      if (!pricePerShare || pricePerShare <= 0) {
        // If no price per share, calculate based on min investment
        // Assume each share unit is worth the minimum investment
        pricePerShare = minInvestment;
        shares = Math.floor(amount / minInvestment);
      } else {
        shares = Math.floor(amount / pricePerShare);
      }

      // Ensure at least 1 share
      if (shares < 1) {
        shares = 1;
        pricePerShare = amount; // Adjust price to match amount
      }

      // Get investment settings - use property-specific if set, otherwise use global
      const globalSettings = await InvestmentSettings.getActiveSettings();
      const defaultSettings = {
        rentalYieldPercentage: 8, // Default 8% annual
        appreciationRatePercentage: 3, // Default 3% annual
        earlyWithdrawalPenaltyPercentage: 5, // Default 5% penalty
        maturityPeriodYears: 5 // Default 5 years
      };

      const settings = globalSettings || defaultSettings;

      // Use property-specific settings if set (not null)
      const propertySettings = property.investmentTerms || {};
      const rentalYield = propertySettings.rentalYieldRate !== null ? propertySettings.rentalYieldRate : settings.rentalYieldPercentage;
      const appreciation = propertySettings.appreciationRate !== null ? propertySettings.appreciationRate : settings.appreciationRatePercentage;
      const penalty = propertySettings.earlyWithdrawalPenaltyPercentage !== null ? propertySettings.earlyWithdrawalPenaltyPercentage : settings.earlyWithdrawalPenaltyPercentage;
      const maturityPeriod = propertySettings.lockingPeriodYears !== null ? propertySettings.lockingPeriodYears : settings.maturityPeriodYears;

      // Create investment
      const investment = new Investment({
        user: userId,
        property: propertyId,
        amount: amount,
        shares: shares,
        pricePerShare: pricePerShare,
        status: 'confirmed',
        paymentDetails: {
          paymentMethod: 'fake',
          isFakePayment: true
        },
        rentalYieldRate: rentalYield,
        appreciationRate: appreciation,
        penaltyRate: penalty,
        maturityDate: new Date(Date.now() + maturityPeriod * 365 * 24 * 60 * 60 * 1000),
        maturityPeriodYears: maturityPeriod,
        investmentDurationYears: maturityPeriod
      });

      await investment.save();

      // Get current balance before creating transaction
      const balanceSummary = await Transaction.getUserBalance(userId);
      const balanceBefore = (balanceSummary.totalDeposits || 0) -
                           (balanceSummary.totalWithdrawals || 0) -
                           (balanceSummary.totalInvestments || 0) +
                           (balanceSummary.totalPayouts || 0);

      // Create transaction record
      const transaction = new Transaction({
        user: userId,
        type: 'investment',
        amount: amount,
        description: `Investment in ${property.title}`,
        status: 'completed',
        paymentMethod: 'wallet',
        relatedEntity: 'property',
        relatedEntityId: propertyId,
        balanceBefore: Math.max(balanceBefore, 0),
        balanceAfter: Math.max(balanceBefore - amount, 0)
      });

      await transaction.save();

      // Update user wallet
      user.wallet.balance = Math.max(balanceBefore - amount, 0);
      user.wallet.totalInvested = (user.wallet.totalInvested || 0) + amount;
      user.investmentSummary.totalInvested = (user.investmentSummary.totalInvested || 0) + amount;
      user.investmentSummary.lastInvestmentDate = new Date();

      // Count unique properties
      const uniqueProperties = await Investment.distinct('property', { user: userId, status: 'confirmed' });
      user.investmentSummary.propertyCount = uniqueProperties.length;

      await user.save();

      // Update property funding progress based on total investments
      if (property.financials && property.financials.totalValue && property.financials.totalValue > 0) {
        // Calculate total invested amount for this property
        const totalInvested = await Investment.aggregate([
          { $match: { property: mongoose.Types.ObjectId(propertyId), status: 'confirmed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const investedAmount = totalInvested[0]?.total || 0;
        property.fundingProgress = Math.min(100, (investedAmount / property.financials.totalValue) * 100);
      }
      await property.save();

      logger.info(`Investment created: User ${userId}, Property ${propertyId}, Amount SAR ${amount}`);

      res.json({
        success: true,
        data: {
          investmentId: investment._id,
          propertyId: propertyId,
          amount: amount,
          shares: shares,
          status: 'confirmed',
          investedAt: investment.createdAt,
          message: `Successfully invested SAR ${amount} in property`
        }
      });

    } catch (error) {
      logger.error('Create investment error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating investment',
        error: error.message
      });
    }
  }
);

// Get active investment settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await InvestmentSettings.getActiveSettings();

    // Create default if doesn't exist
    if (!settings) {
      await InvestmentSettings.ensureDefaultExists();
      settings = await InvestmentSettings.getActiveSettings();
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch investment settings',
      error: error.message
    });
  }
});

// Create new investment settings (Admin only)
router.post('/settings', authenticate, async (req, res) => {
  try {
    // Deactivate all existing settings
    await InvestmentSettings.updateMany({}, { isActive: false });

    // Create new active settings
    const settings = await InvestmentSettings.create({
      ...req.body,
      isActive: true,
      createdBy: req.user._id
    });

    res.status(201).json(settings);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to create investment settings',
      error: error.message
    });
  }
});

// Update investment settings (Admin only)
router.put('/settings/:id', authenticate, async (req, res) => {
  try {
    const settings = await InvestmentSettings.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Investment settings not found'
      });
    }

    res.json(settings);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update investment settings',
      error: error.message
    });
  }
});

// Calculate investment returns
router.post('/calculate', async (req, res) => {
  try {
    const { investmentAmount } = req.body;

    if (!investmentAmount || investmentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid investment amount is required'
      });
    }

    const settings = await InvestmentSettings.getActiveSettings();
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: 'No active investment settings found'
      });
    }

    const amount = parseFloat(investmentAmount);
    const rentalYield = settings.rentalYieldPercentage;
    const appreciation = settings.appreciationRatePercentage;
    const maturityYears = settings.maturityPeriodYears;

    // Calculate rental income (earned during entire locking period)
    const annualRentalIncome = amount * (rentalYield / 100);
    const totalRentalIncome = annualRentalIncome * maturityYears;

    // Calculate appreciation (only applied at maturity)
    const finalValue = amount * Math.pow(1 + appreciation / 100, maturityYears);
    const appreciationGain = finalValue - amount;

    // Total returns at maturity (rental income + appreciation)
    const totalReturnsAtMaturity = totalRentalIncome + appreciationGain;
    const totalValueAtMaturity = amount + totalReturnsAtMaturity;

    // During locking period (before maturity): only rental yield
    const returnsAtLocking = totalRentalIncome;
    const valueAtLocking = amount + returnsAtLocking;

    // Calculate early withdrawal penalty
    const penaltyAmount = amount * (settings.earlyWithdrawalPenaltyPercentage / 100);
    const amountAfterEarlyWithdrawalPenalty = amount - penaltyAmount;

    res.json({
      success: true,
      investmentAmount: amount,
      settings: {
        rentalYieldPercentage: rentalYield,
        appreciationRatePercentage: appreciation,
        maturityPeriodYears: maturityYears,
        lockingPeriodYears: maturityYears,
        investmentDurationYears: settings.investmentDurationYears,
        earlyWithdrawalPenaltyPercentage: settings.earlyWithdrawalPenaltyPercentage
      },
      returns: {
        annualRentalIncome,
        // During locking period (years 1-3)
        lockingPeriod: {
          rentalYield: totalRentalIncome,
          projectedValue: valueAtLocking,
          description: `After ${maturityYears} years (locking period)`
        },
        // After maturity (year 3+)
        atMaturity: {
          rentalYield: totalRentalIncome,
          appreciation: appreciationGain,
          totalReturns: totalReturnsAtMaturity,
          projectedValue: totalValueAtMaturity,
          description: `At maturity after ${maturityYears} years`
        }
      },
      earlyWithdrawal: {
        lockingPeriodYears: maturityYears,
        penaltyPercentage: settings.earlyWithdrawalPenaltyPercentage,
        penaltyAmount,
        amountAfterPenalty: amountAfterEarlyWithdrawalPenalty,
        description: `Penalty applied if withdrawn before ${maturityYears} years`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to calculate investment returns',
      error: error.message
    });
  }
});

// Withdraw investment
router.post('/:id/withdraw', authenticate, async (req, res) => {
  try {
    const investment = await Investment.findById(req.params.id);

    if (!investment) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found'
      });
    }

    // Verify ownership
    if (investment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to withdraw this investment'
      });
    }

    if (investment.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Investment is not active'
      });
    }

    const now = new Date();
    const maturityDate = investment.maturityDate ? new Date(investment.maturityDate) : null;

    // Check if withdrawal is before maturity
    const isEarlyWithdrawal = maturityDate && now < maturityDate;

    let withdrawalAmount = investment.amount;
    let penalty = 0;

    if (isEarlyWithdrawal && investment.penaltyRate) {
      penalty = withdrawalAmount * (investment.penaltyRate / 100);
      withdrawalAmount = withdrawalAmount - penalty;
    }

    // Update investment status
    investment.status = 'cancelled';
    investment.exitDate = now;
    await investment.save();

    res.json({
      success: true,
      investment,
      withdrawalAmount,
      penalty,
      isEarlyWithdrawal,
      message: isEarlyWithdrawal
        ? `Early withdrawal with ${investment.penaltyRate}% penalty`
        : 'Withdrawal after maturity - no penalty'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal',
      error: error.message
    });
  }
});

module.exports = router;
