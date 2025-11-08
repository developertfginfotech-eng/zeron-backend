const express = require('express');
const router = express.Router();
const InvestmentSettings = require('../models/InvestmentSettings');
const Investment = require('../models/Investment');
const { authenticate } = require('../middleware/auth');

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

    // Calculate rental income
    const annualRentalIncome = amount * (rentalYield / 100);
    const totalRentalIncome = annualRentalIncome * maturityYears;

    // Calculate appreciation (compound)
    const finalValue = amount * Math.pow(1 + appreciation / 100, maturityYears);
    const appreciationGain = finalValue - amount;

    // Total returns at maturity
    const totalReturnsAtMaturity = totalRentalIncome + appreciationGain;
    const totalValueAtMaturity = amount + totalReturnsAtMaturity;

    // Calculate early withdrawal penalty
    const penaltyAmount = amount * (settings.earlyWithdrawalPenaltyPercentage / 100);

    res.json({
      success: true,
      investmentAmount: amount,
      settings: {
        rentalYieldPercentage: rentalYield,
        appreciationRatePercentage: appreciation,
        maturityPeriodYears: maturityYears,
        investmentDurationYears: settings.investmentDurationYears,
        earlyWithdrawalPenaltyPercentage: settings.earlyWithdrawalPenaltyPercentage
      },
      returns: {
        annualRentalIncome,
        totalRentalIncome,
        appreciationGain,
        totalReturnsAtMaturity,
        totalValueAtMaturity
      },
      earlyWithdrawal: {
        penaltyAmount,
        amountAfterPenalty: amount - penaltyAmount
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
