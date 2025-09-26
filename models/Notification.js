const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'kyc_approved',
      'kyc_rejected',
      'kyc_under_review',
      'investment_confirmed',
      'investment_cancelled',
      'monthly_income_deposit',
      'new_property_match',
      'property_available',
      'system_announcement',
      'app_update',
      'policy_change',
      'payment_received',
      'payment_failed',
      'account_security',
      'user_registration',
      'new_user_registration',
      'kyc_approved_admin',
      'new_property_added',
      'general'
    ],
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true
  },
  channels: {
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String,
      error: String
    },
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String,
      error: String
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String,
      error: String
    }
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  readAt: Date,
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  scheduledFor: Date,
  expiresAt: Date,
  relatedEntity: {
    entityType: {
      type: String,
      enum: ['property', 'investment', 'kyc', 'transaction', 'user']
    },
    entityId: mongoose.Schema.Types.ObjectId
  },
  actionUrl: String,
  actionLabel: String,
  metadata: {
    platform: String,
    deviceType: String,
    userAgent: String,
    ipAddress: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, type: 1 });
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for time remaining until expiry
notificationSchema.virtual('timeToExpiry').get(function() {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diff = this.expiresAt - now;
  return diff > 0 ? diff : 0;
});

// Mark notification as read
notificationSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    return await this.save();
  }
  return this;
};

// Update channel status
notificationSchema.methods.updateChannelStatus = async function(channel, status, messageId = null, error = null) {
  if (this.channels[channel]) {
    this.channels[channel].sent = status === 'sent';
    this.channels[channel].sentAt = status === 'sent' ? new Date() : this.channels[channel].sentAt;
    this.channels[channel].messageId = messageId || this.channels[channel].messageId;
    this.channels[channel].error = error;

    // Update overall status
    const allChannels = Object.values(this.channels);
    const sentChannels = allChannels.filter(ch => ch.sent);
    const failedChannels = allChannels.filter(ch => ch.error);

    if (sentChannels.length > 0) {
      this.status = 'sent';
    } else if (failedChannels.length === allChannels.length) {
      this.status = 'failed';
    }

    return await this.save();
  }
  return this;
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    user: userId,
    isRead: false,
    status: { $ne: 'cancelled' }
  });
};

// Static method to mark all as read for user
notificationSchema.statics.markAllAsReadForUser = function(userId) {
  return this.updateMany(
    { user: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

// Static method to get notifications by type and priority
notificationSchema.statics.findByTypeAndPriority = function(userId, type, priority) {
  const query = { user: userId };
  if (type) query.type = type;
  if (priority) query.priority = priority;

  return this.find(query)
    .sort({ createdAt: -1 })
    .populate('user', 'firstName lastName email');
};

// Pre-save middleware to set expiry for certain types
notificationSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    // Set default expiry based on type
    const expiryDays = {
      'system_announcement': 30,
      'app_update': 7,
      'policy_change': 30,
      'general': 30
    };

    if (expiryDays[this.type]) {
      this.expiresAt = new Date(Date.now() + expiryDays[this.type] * 24 * 60 * 60 * 1000);
    }
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);