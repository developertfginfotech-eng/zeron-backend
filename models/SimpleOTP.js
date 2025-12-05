// backend/models/SimpleOTP.js
const mongoose = require('mongoose');

const simpleOTPSchema = new mongoose.Schema({
  otp: {
    type: String,
    required: true,
    length: 6
  },
  operation: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'update_role', 'deactivate_admin', 'promote_super_admin', 'promote_to_admin']
  },
  propertyData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false // Only for update/delete
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'used', 'expired'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  }
}, {
  timestamps: true
});

// Check if OTP is valid
simpleOTPSchema.methods.isValid = function(inputOTP) {
  if (this.status !== 'pending') return false;
  if (new Date() > this.expiresAt) return false;
  if (this.attempts >= 3) return false;
  return this.otp === inputOTP;
};

// Mark as used
simpleOTPSchema.methods.markUsed = function() {
  this.status = 'used';
  return this.save();
};

module.exports = mongoose.model('SimpleOTP', simpleOTPSchema);