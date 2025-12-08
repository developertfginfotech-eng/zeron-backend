const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  investmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investment'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  principalAmount: {
    type: Number,
    required: true
  },
  rentalYieldEarned: {
    type: Number,
    default: 0
  },
  reason: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String,
    enum: ['insufficient_investment', 'maturity_period_active', 'suspicious_activity', 'invalid_request', 'other']
  },
  rejectionComment: {
    type: String,
    trim: true
  },
  processedAt: {
    type: Date
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  // Bank account details for the withdrawal
  bankAccount: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // For tracking which group the request came from (for team lead filtering)
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  // For tracking which subgroup the request came from
  subgroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    sparse: true
  }
}, {
  timestamps: true
});

// Index for faster queries
withdrawalRequestSchema.index({ userId: 1 });
withdrawalRequestSchema.index({ status: 1 });
withdrawalRequestSchema.index({ requestedAt: -1 });
withdrawalRequestSchema.index({ groupId: 1 });
withdrawalRequestSchema.index({ subgroupId: 1 });
withdrawalRequestSchema.index({ status: 1, requestedAt: -1 });
withdrawalRequestSchema.index({ propertyId: 1 });
withdrawalRequestSchema.index({ groupId: 1, status: 1 });

// Method to approve withdrawal request
withdrawalRequestSchema.methods.approve = async function(approverId) {
  this.status = 'approved';
  this.reviewedAt = new Date();
  this.reviewedBy = approverId;
  return this.save();
};

// Method to reject withdrawal request
withdrawalRequestSchema.methods.reject = async function(approverId, reason, comment) {
  this.status = 'rejected';
  this.reviewedAt = new Date();
  this.reviewedBy = approverId;
  this.rejectionReason = reason;
  this.rejectionComment = comment;
  return this.save();
};

// Method to mark as processing
withdrawalRequestSchema.methods.markAsProcessing = async function(transactionId) {
  this.status = 'processing';
  this.processedAt = new Date();
  this.transactionId = transactionId;
  return this.save();
};

// Method to mark as completed
withdrawalRequestSchema.methods.markAsCompleted = async function(transactionId) {
  this.status = 'completed';
  this.processedAt = new Date();
  this.transactionId = transactionId;
  return this.save();
};

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
