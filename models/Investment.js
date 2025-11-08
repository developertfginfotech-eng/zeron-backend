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
    lastReturnDate: {
      type: Date
    }
  },
  // Investment Terms (snapshot at investment time)
  maturityDate: {
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
  maturityPeriodYears: {
    type: Number
  },
  investmentDurationYears: {
    type: Number
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
      $lookup: {
        from: 'properties',
        localField: 'property',
        foreignField: '_id',
        as: 'propertyDetails'
      }
    },
    {
      $unwind: '$propertyDetails'
    },
    {
      $addFields: {
        currentValue: {
          $multiply: ['$shares', '$propertyDetails.financials.pricePerShare']
        }
      }
    },
    {
      $group: {
        _id: '$user',
        totalInvestments: { $sum: '$amount' },
        totalCurrentValue: { $sum: '$currentValue' },
        totalReturns: { $sum: '$returns.totalReturnsReceived' },
        propertyCount: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model('Investment', investmentSchema);