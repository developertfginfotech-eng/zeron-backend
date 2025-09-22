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
    min: 1000
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
      required: true
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['mada', 'visa', 'mastercard', 'apple_pay', 'samsung_pay']
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true
    },
    paymentDate: {
      type: Date
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
        user: mongoose.Types.ObjectId(userId), 
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