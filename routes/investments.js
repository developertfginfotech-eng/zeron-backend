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
    const { calculateInvestmentReturns } = require('../utils/calculate-investment-returns');

    const investments = await Investment.find({
      user: req.user.id,
      status: 'confirmed'
    })
    .populate('property', 'title titleAr financials location images status')
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      success: true,
      data: investments
        .filter(inv => inv.property) // Filter out investments with null property references
        .map(inv => {
          // Calculate real-time returns for this investment
          const calculatedReturns = calculateInvestmentReturns(inv);

          return {
            _id: inv._id,
            propertyId: inv.property._id,
            propertyName: inv.property.title,
            amount: inv.amount,
            shares: inv.shares,
            status: inv.status,
            createdAt: inv.createdAt,
            investedAt: inv.createdAt,
            // Investment type and management fees
            investmentType: inv.investmentType || 'simple_annual',
            managementFee: inv.managementFee || { feePercentage: 0, feeAmount: 0, netInvestment: inv.amount },
            // Real-time calculated returns (unrealized)
            currentValue: calculatedReturns.currentValue,
            returns: calculatedReturns.totalReturns,
            rentalYieldEarned: calculatedReturns.rentalYieldEarned,
            appreciationGain: calculatedReturns.appreciationGain,
            holdingPeriodYears: calculatedReturns.holdingPeriodYears,
            isAfterMaturity: calculatedReturns.isAfterMaturity,
            // Original rates
            rentalYieldRate: inv.rentalYieldRate || 0,
            appreciationRate: inv.appreciationRate || 0,
            penaltyRate: inv.penaltyRate || 0,
            // Bond-specific fields
            bondMaturityDate: inv.bondMaturityDate,
            lockInEndDate: inv.lockInEndDate,
            isInLockInPeriod: inv.isInLockInPeriod || false,
            hasMatured: inv.hasMatured || false,
            maturityPeriodYears: inv.maturityPeriodYears || 5,
            property: inv.property
          };
        })
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
    // Accept either shares OR amount (for backward compatibility)
    body('shares')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Shares must be at least 1'),
    body('amount')
      .optional()
      .isFloat({ min: 1000 })
      .withMessage('Minimum investment is SAR 1,000')
  ],
  async (req, res) => {
    try {
      const { propertyId, shares: requestedShares, amount: requestedAmount, investmentType: requestedInvestmentType } = req.body;
      const userId = req.user.id;

      // Validate that either shares or amount is provided
      if (!requestedShares && !requestedAmount) {
        return res.status(400).json({
          success: false,
          message: 'Either shares or amount must be provided'
        });
      }

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

      // Get price per share
      const pricePerShare = property.financials.pricePerShare || property.financials.minInvestment || 1000;
      const minInvestment = property.financials.minInvestment || 1000;

      // Calculate shares and amount based on what was provided
      let shares, amount;

      if (requestedShares) {
        // User provided shares (units) - calculate amount
        shares = parseInt(requestedShares);
        amount = shares * pricePerShare;

        // Check minimum investment
        if (amount < minInvestment) {
          const minShares = Math.ceil(minInvestment / pricePerShare);
          return res.status(400).json({
            success: false,
            message: `Minimum ${minShares} shares required (SAR ${minInvestment} minimum investment)`
          });
        }

        // Check available shares
        if (shares > (property.financials.availableShares || 0)) {
          return res.status(400).json({
            success: false,
            message: `Only ${property.financials.availableShares} shares available`
          });
        }
      } else {
        // User provided amount - calculate shares (backward compatibility)
        amount = parseFloat(requestedAmount);

        // Check minimum investment
        if (amount < minInvestment) {
          return res.status(400).json({
            success: false,
            message: `Minimum investment is SAR ${minInvestment}`
          });
        }

        shares = Math.floor(amount / pricePerShare);

        // Ensure at least 1 share
        if (shares < 1) {
          shares = 1;
        }
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

      // Determine investment type: use requested type if provided, otherwise check property config
      const isBondInvestment = requestedInvestmentType === 'bond'
        ? true
        : requestedInvestmentType === 'simple_annual'
          ? false
          : (property.investmentTerms?.bondMaturityYears ? true : false);

      // Get investment settings - use property-specific if set, otherwise use global
      const globalSettings = await InvestmentSettings.getActiveSettings();
      const defaultSettings = {
        rentalYieldPercentage: 8, // Default 8% annual
        appreciationRatePercentage: 3, // Default 3% annual
        earlyWithdrawalPenaltyPercentage: 5, // Default 5% penalty
        maturityPeriodYears: 5 // Default 5 years for bonds
      };

      const settings = globalSettings || defaultSettings;

      // Use property-specific settings if set (not null)
      const propertySettings = property.investmentTerms || {};
      const rentalYield = propertySettings.rentalYieldRate !== null ? propertySettings.rentalYieldRate : settings.rentalYieldPercentage;
      const appreciation = propertySettings.appreciationRate !== null ? propertySettings.appreciationRate : settings.appreciationRatePercentage;
      const penalty = propertySettings.earlyWithdrawalPenaltyPercentage !== null ? propertySettings.earlyWithdrawalPenaltyPercentage : settings.earlyWithdrawalPenaltyPercentage;

      // For annual plans, use 1 year; for bonds, use the admin-configured bond maturity period
      const maturityPeriod = isBondInvestment
        ? (propertySettings.bondMaturityYears !== null ? propertySettings.bondMaturityYears : settings.maturityPeriodYears)
        : 1; // Annual plans are 1 year

      // Lock-in period: for bonds use lockingPeriodYears, for annual plans always 1 year
      const lockInPeriod = isBondInvestment
        ? (propertySettings.lockingPeriodYears !== null ? propertySettings.lockingPeriodYears : 1)
        : 1; // Annual plans always 1 year

      // Get graduated penalties from property (if available)
      const graduatedPenalties = propertySettings.graduatedPenalties || [];

      // Maturity date in real years (display purposes)
      // NOTE: Returns calculation uses accelerated time (1 hour = 1 year) for testing
      const maturityDateMs = Date.now() + maturityPeriod * 365 * 24 * 60 * 60 * 1000; // years
      const lockInEndDateMs = Date.now() + lockInPeriod * 365 * 24 * 60 * 60 * 1000; // years

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
        // Set investment type: bond or simple_annual
        investmentType: isBondInvestment ? 'bond' : 'simple_annual',
        rentalYieldRate: rentalYield,
        appreciationRate: appreciation,
        penaltyRate: penalty,
        // Store graduated penalties for proper withdrawal calculation
        graduatedPenalties: graduatedPenalties,
        maturityDate: new Date(maturityDateMs),
        // For bond investments, set bondMaturityDate and lockInEndDate
        bondMaturityDate: isBondInvestment ? new Date(maturityDateMs) : undefined,
        lockInEndDate: new Date(lockInEndDateMs),
        maturityPeriodYears: maturityPeriod,
        investmentDurationYears: maturityPeriod,
        bondMaturityYears: isBondInvestment ? propertySettings.bondMaturityYears : undefined,
        lockingPeriodYears: lockInPeriod,
        // Set initial lock-in status (in lock-in period initially)
        isInLockInPeriod: true,
        hasMatured: false
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
          { $match: { property: new mongoose.Types.ObjectId(propertyId), status: 'confirmed' } },
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
      createdBy: req.user.id
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
      { ...req.body, updatedBy: req.user.id },
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

// Withdraw investment (bond-break or normal withdrawal)
router.post('/:id/bond-break-withdraw', authenticate, async (req, res) => {
  try {
    const investment = await Investment.findById(req.params.id).populate('property', 'title');

    if (!investment) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found'
      });
    }

    // Check if investment has a user
    if (!investment.user) {
      return res.status(400).json({
        success: false,
        message: 'Investment has no associated user'
      });
    }

    // Verify ownership
    if (investment.user.toString() !== req.user.id.toString()) {
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
    const investmentDate = new Date(investment.createdAt);
    const maturityDate = investment.bondMaturityDate ? new Date(investment.bondMaturityDate) : null;

    // Calculate holding period in years
    const holdingPeriodMs = now - investmentDate;

    // ==================== TEST MODE (REMOVE BEFORE PRODUCTION) ====================
    // Accelerated time for testing: 1 hour = 1 year
    // Comment out this line to use real time
    const holdingPeriodYears = holdingPeriodMs / (60 * 60 * 1000); // 1 hour = 1 year

    // Real time calculation (uncomment for production):
    // const holdingPeriodYears = holdingPeriodMs / (365 * 24 * 60 * 60 * 1000);
    // ==================== END TEST MODE ====================

    // Check if withdrawal is before maturity
    const isEarlyWithdrawal = maturityDate && now < maturityDate;

    const principalAmount = investment.amount;
    const rentalYieldRate = investment.rentalYieldRate || 0;
    const appreciationRate = investment.appreciationRate || 0;
    const penaltyRate = investment.penaltyRate || 0;
    const maturityPeriodYears = investment.maturityPeriodYears || 5;

    // Calculate rental yield earned (earned throughout holding period)
    const annualRentalIncome = principalAmount * (rentalYieldRate / 100);
    const totalRentalYield = annualRentalIncome * Math.min(holdingPeriodYears, maturityPeriodYears);

    let appreciationGain = 0;
    let totalValue = principalAmount + totalRentalYield;
    let penalty = 0;
    let withdrawalAmount = 0;
    let actualPenaltyRate = penaltyRate;

    if (isEarlyWithdrawal) {
      // EARLY WITHDRAWAL (Before Maturity)
      // User gets: Principal + Rental Yield - Penalty
      // NO appreciation gains (only after maturity)

      // Determine penalty rate: prefer graduated penalties if available
      if (investment.graduatedPenalties && investment.graduatedPenalties.length > 0) {
        // Calculate current year of investment
        const currentYear = Math.floor((holdingPeriodYears)) + 1;
        const penaltyTier = investment.graduatedPenalties.find(p => p.year === currentYear);
        actualPenaltyRate = penaltyTier ? penaltyTier.penaltyPercentage : (penaltyRate || 0);
      }

      penalty = principalAmount * (actualPenaltyRate / 100);
      withdrawalAmount = principalAmount + totalRentalYield - penalty;

    } else {
      // AFTER MATURITY
      // User gets: Principal + Full Rental Yield + Appreciation Gains

      // Calculate appreciation for years held after maturity
      const yearsAfterMaturity = Math.max(0, holdingPeriodYears - maturityPeriodYears);

      // Appreciation is calculated on the principal for years after maturity
      // Using compound interest formula: FV = PV * (1 + r)^n
      if (yearsAfterMaturity > 0) {
        const appreciatedValue = principalAmount * Math.pow(1 + appreciationRate / 100, yearsAfterMaturity);
        appreciationGain = appreciatedValue - principalAmount;
      }

      totalValue = principalAmount + totalRentalYield + appreciationGain;
      withdrawalAmount = totalValue;
    }

    // Get user and update wallet
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get current balance
    const balanceSummary = await Transaction.getUserBalance(req.user.id);
    const balanceBefore = (balanceSummary.totalDeposits || 0) -
                         (balanceSummary.totalWithdrawals || 0) -
                         (balanceSummary.totalInvestments || 0) +
                         (balanceSummary.totalPayouts || 0);

    // Create withdrawal transaction
    const transaction = new Transaction({
      user: req.user.id,
      type: 'payout',
      amount: withdrawalAmount,
      description: `Withdrawal from ${investment.property.title} - ${isEarlyWithdrawal ? 'Early (with penalty)' : 'After maturity'}`,
      status: 'completed',
      paymentMethod: 'wallet',
      relatedEntity: 'investment',
      relatedEntityId: investment._id,
      balanceBefore: Math.max(balanceBefore, 0),
      balanceAfter: Math.max(balanceBefore + withdrawalAmount, 0),
      metadata: {
        principalAmount,
        rentalYield: totalRentalYield,
        appreciationGain,
        penalty,
        isEarlyWithdrawal,
        holdingPeriodYears: holdingPeriodYears.toFixed(2)
      }
    });

    await transaction.save();

    // Update user wallet
    user.wallet.balance = Math.max(balanceBefore + withdrawalAmount, 0);
    user.wallet.totalReturns = (user.wallet.totalReturns || 0) + totalRentalYield + appreciationGain;
    await user.save();

    // Update investment status
    investment.status = 'cancelled';
    investment.exitDate = now;
    investment.returns.totalReturnsReceived = totalRentalYield + appreciationGain;
    investment.returns.lastReturnDate = now;
    await investment.save();

    logger.info(`Investment withdrawn: User ${req.user.id}, Investment ${investment._id}, Amount SAR ${withdrawalAmount}`);

    res.json({
      success: true,
      data: {
        withdrawalDetails: {
          principalAmount,
          rentalYieldEarned: totalRentalYield,
          appreciationGain,
          penalty,
          totalWithdrawalAmount: withdrawalAmount
        },
        timing: {
          investedDate: investmentDate,
          maturityDate,
          withdrawalDate: now,
          holdingPeriodYears: holdingPeriodYears.toFixed(2),
          isEarlyWithdrawal
        },
        rates: {
          rentalYieldRate: `${rentalYieldRate}%`,
          appreciationRate: `${appreciationRate}%`,
          penaltyRate: isEarlyWithdrawal ? `${actualPenaltyRate}%` : 'N/A'
        },
        newWalletBalance: user.wallet.balance
      },
      message: isEarlyWithdrawal
        ? `Early withdrawal completed with ${actualPenaltyRate}% penalty (Year ${Math.floor(holdingPeriodYears) + 1}). Amount credited: SAR ${withdrawalAmount.toFixed(2)}`
        : `Withdrawal after maturity completed. Total returns: SAR ${(totalRentalYield + appreciationGain).toFixed(2)}`
    });

  } catch (error) {
    logger.error('Withdraw investment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal',
      error: error.message
    });
  }
});

module.exports = router;
