const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'investment', 'payout', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'card', 'wallet', 'other'],
    default: 'bank_transfer'
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true,
    default: function() {
      return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  },
  reference: {
    type: String,
    trim: true
  },
  relatedEntity: {
    type: String,
    enum: ['investment', 'property', 'user', null],
    default: null
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    sparse: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  balanceBefore: {
    type: Number,
    default: 0
  },
  balanceAfter: {
    type: Number,
    default: 0
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    sparse: true,
    index: true
  },
  subgroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    sparse: true,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ user: 1, type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ groupId: 1, createdAt: -1 });
transactionSchema.index({ subgroupId: 1, createdAt: -1 });
transactionSchema.index({ groupId: 1, status: 1 });

// Static methods
transactionSchema.statics.findByUser = function(userId) {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(100);
};

transactionSchema.statics.getUserBalance = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalDeposits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0]
          }
        },
        totalWithdrawals: {
          $sum: {
            $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0]
          }
        },
        totalInvestments: {
          $sum: {
            $cond: [{ $eq: ['$type', 'investment'] }, '$amount', 0]
          }
        },
        totalPayouts: {
          $sum: {
            $cond: [{ $eq: ['$type', 'payout'] }, '$amount', 0]
          }
        }
      }
    }
  ]);

  return result.length > 0 ? result[0] : {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalInvestments: 0,
    totalPayouts: 0
  };
};

module.exports = mongoose.model('Transaction', transactionSchema);