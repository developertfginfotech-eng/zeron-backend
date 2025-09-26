const mongoose = require('mongoose');

const passwordResetOTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'used', 'expired'],
    default: 'pending',
    index: true
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    index: true
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Index for cleanup
passwordResetOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Check if OTP is valid
passwordResetOTPSchema.methods.isValid = function(inputOTP) {
  if (this.status !== 'pending') return false;
  if (new Date() > this.expiresAt) return false;
  if (this.attempts >= 3) return false;
  return this.otp === inputOTP.toString();
};

// Mark as used
passwordResetOTPSchema.methods.markUsed = function() {
  this.status = 'used';
  return this.save();
};

// Mark as expired
passwordResetOTPSchema.methods.markExpired = function() {
  this.status = 'expired';
  return this.save();
};

// Increment attempts
passwordResetOTPSchema.methods.incrementAttempts = function() {
  this.attempts += 1;
  if (this.attempts >= 3) {
    this.status = 'expired';
  }
  return this.save();
};

// Static method to cleanup expired OTPs
passwordResetOTPSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    { status: 'expired' }
  );
};

// Static method to invalidate all pending OTPs for user
passwordResetOTPSchema.statics.invalidateUserOTPs = function(userId) {
  return this.updateMany(
    { userId: userId, status: 'pending' },
    { status: 'expired' }
  );
};

module.exports = mongoose.model('PasswordResetOTP', passwordResetOTPSchema);