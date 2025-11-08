const mongoose = require('mongoose');

const investmentSettingsSchema = new mongoose.Schema({
  // Rental and Returns
  rentalYieldPercentage: {
    type: Number,
    required: true,
    default: 8.00,
    min: 0,
    max: 100
  },
  appreciationRatePercentage: {
    type: Number,
    required: true,
    default: 5.00,
    min: 0,
    max: 100
  },

  // Time Periods
  maturityPeriodYears: {
    type: Number,
    required: true,
    default: 3,
    min: 1
  },
  investmentDurationYears: {
    type: Number,
    required: true,
    default: 5,
    min: 1
  },

  // Penalties and Fees
  earlyWithdrawalPenaltyPercentage: {
    type: Number,
    required: true,
    default: 15.00,
    min: 0,
    max: 100
  },
  platformFeePercentage: {
    type: Number,
    default: 2.00,
    min: 0,
    max: 100
  },

  // Investment Limits
  minInvestmentAmount: {
    type: Number,
    required: true,
    default: 1000.00
  },
  maxInvestmentAmount: {
    type: Number,
    required: true,
    default: 1000000.00
  },

  // Status
  isActive: {
    type: Boolean,
    required: true,
    default: true
  },
  description: {
    type: String
  },

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for finding active settings
investmentSettingsSchema.index({ isActive: 1 });

// Static method to get active settings
investmentSettingsSchema.statics.getActiveSettings = function() {
  return this.findOne({ isActive: true });
};

// Static method to create default settings if none exist
investmentSettingsSchema.statics.ensureDefaultExists = async function() {
  const count = await this.countDocuments();
  if (count === 0) {
    await this.create({
      rentalYieldPercentage: 8.00,
      appreciationRatePercentage: 5.00,
      maturityPeriodYears: 3,
      investmentDurationYears: 5,
      earlyWithdrawalPenaltyPercentage: 15.00,
      platformFeePercentage: 2.00,
      minInvestmentAmount: 1000.00,
      maxInvestmentAmount: 1000000.00,
      isActive: true,
      description: 'Default investment settings'
    });
  }
};

module.exports = mongoose.model('InvestmentSettings', investmentSettingsSchema);
