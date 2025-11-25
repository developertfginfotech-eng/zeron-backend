const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  shares: {
    type: Number,
    required: true,
    min: 1
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerShare: {
    type: Number,
    required: true,
    min: 0
  },
  // Management fee tracking
  managementFee: {
    feePercentage: { type: Number, default: 0 }, // Percentage charged (e.g., 1.80 or 2.60)
    feeAmount: { type: Number, default: 0 }, // Actual fee amount deducted
    netInvestment: { type: Number, default: 0 } // Amount after fee deduction (amount - feeAmount)
  },
  // Investment type: simple annual or bond-based
  investmentType: {
    type: String,
    required: true,
    enum: ['simple_annual', 'bond'],
    default: 'simple_annual'
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentDetails: {
    paymentId: {
      type: String,
      required: false,
      default: function() {
        return `fake_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    },
    paymentMethod: {
      type: String,
      required: false,
      enum: ['mada', 'visa', 'mastercard', 'apple_pay', 'samsung_pay', 'fake'],
      default: 'fake'
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
      default: function() {
        return `fake_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    },
    paymentDate: {
      type: Date,
      default: Date.now
    },
    isFakePayment: {
      type: Boolean,
      default: true
    }
  },
  returns: {
    totalReturnsReceived: {
      type: Number,
      default: 0
    },
    rentalYieldReceived: {
      type: Number,
      default: 0
    },
    appreciationReceived: {
      type: Number,
      default: 0
    },
    lastReturnDate: {
      type: Date
    },
    lastRentalYieldDate: {
      type: Date
    }
  },
  // Investment Terms (snapshot at investment time)
  investmentDate: {
    type: Date,
    default: Date.now
  },
  lockInEndDate: {
    type: Date
  },
  bondMaturityDate: {
    type: Date
  },
  exitDate: {
    type: Date
  },
  rentalYieldRate: {
    type: Number
  },
  appreciationRate: {
    type: Number
  },
  penaltyRate: {
    type: Number
  },
  // Graduated penalties for this investment (snapshot from property)
  graduatedPenalties: [{
    year: { type: Number },
    penaltyPercentage: { type: Number }
  }],
  lockingPeriodYears: {
    type: Number
  },
  bondMaturityYears: {
    type: Number
  },
  maturityPeriodYears: {
    type: Number
  },
  investmentDurationYears: {
    type: Number
  },
  // Current status tracking
  isInLockInPeriod: {
    type: Boolean,
    default: true
  },
  hasMatured: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound indexes
investmentSchema.index({ user: 1, property: 1 });
investmentSchema.index({ user: 1, status: 1 });
investmentSchema.index({ property: 1, status: 1 });
investmentSchema.index({ 'paymentDetails.transactionId': 1 });

// Static methods
investmentSchema.statics.findByUser = function(userId) {
  return this.find({ user: userId, status: 'confirmed' })
    .populate('property', 'title titleAr financials location images');
};

investmentSchema.statics.getUserPortfolioSummary = function(userId) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: 'confirmed'
      }
    },
    {
      $addFields: {
        // Calculate returns from the investment
        investmentReturns: {
          $ifNull: ['$returns.totalReturnsReceived', 0]
        }
      }
    },
    {
      $addFields: {
        // Current value = original amount + returns
        // This ensures we don't have rounding losses from share calculations
        currentValue: {
          $add: ['$amount', '$investmentReturns']
        }
      }
    },
    {
      $group: {
        _id: '$user',
        totalInvestments: { $sum: '$amount' },
        totalCurrentValue: { $sum: '$currentValue' },
        totalReturns: { $sum: '$investmentReturns' },
        propertyCount: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model('Investment', investmentSchema);