const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    unique: true,
    match: [/^(\+966|966|0)?[5-9]\d{8}$/, 'Invalid Saudi phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name too long']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name too long']
  },
  nationalId: {
    type: String,
    unique: true,
    sparse: true,
    match: [/^\d{10}$/, 'Invalid National ID']
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'super_admin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'active'
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected'],
    default: 'pending'
  },
  preferredLanguage: {
    type: String,
    enum: ['ar', 'en'],
    default: 'ar'
  },
  // ADD THESE MISSING FIELDS FOR PORTFOLIO FUNCTIONALITY
  address: {
    street: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    district: {
      type: String,
      trim: true
    },
    postalCode: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      default: 'SA'
    }
  },
  wallet: {
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    totalInvested: {
      type: Number,
      default: 0,
      min: 0
    },
    totalReturns: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  preferences: {
    language: {
      type: String,
      enum: ['en', 'ar'],
      default: 'ar'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    currency: {
      type: String,
      default: 'SAR'
    }
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  }],
  investmentSummary: {
    totalInvested: {
      type: Number,
      default: 0,
      min: 0
    },
    totalReturns: {
      type: Number,
      default: 0,
      min: 0
    },
    propertyCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastInvestmentDate: {
      type: Date
    }
  },
  // KEEP YOUR EXISTING SECURITY FIELDS
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,
  // ADD THESE FOR ENHANCED FUNCTIONALITY
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  deviceTokens: [{
    token: String,
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  }
});

// INDEXES FOR PERFORMANCE
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ nationalId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ kycStatus: 1 });
userSchema.index({ status: 1, isActive: 1 });

// KEEP YOUR EXISTING METHODS
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.methods.incLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1, loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.lockUntil) {
    updates.$set = {
      lockUntil: Date.now() + 30 * 60 * 1000 // 30 minutes
    };
  }
  
  return this.updateOne(updates);
};

// ADD THESE NEW METHODS FOR PORTFOLIO FUNCTIONALITY
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.statics.findByEmailOrPhone = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier },
      { phone: identifier }
    ]
  });
};

userSchema.methods.updateInvestmentSummary = async function() {
  const Investment = mongoose.model('Investment');
  
  const summary = await Investment.aggregate([
    {
      $match: {
        user: this._id,
        status: 'confirmed'
      }
    },
    {
      $group: {
        _id: null,
        totalInvested: { $sum: '$amount' },
        totalReturns: { $sum: '$returns.totalReturnsReceived' },
        propertyCount: { $sum: 1 },
        lastInvestment: { $max: '$createdAt' }
      }
    }
  ]);

  if (summary.length > 0) {
    this.investmentSummary = {
      totalInvested: summary[0].totalInvested,
      totalReturns: summary[0].totalReturns,
      propertyCount: summary[0].propertyCount,
      lastInvestmentDate: summary[0].lastInvestment
    };
    await this.save();
  }
};

userSchema.methods.addToFavorites = function(propertyId) {
  if (!this.favorites.includes(propertyId)) {
    this.favorites.push(propertyId);
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.removeFromFavorites = function(propertyId) {
  this.favorites = this.favorites.filter(id => !id.equals(propertyId));
  return this.save();
};

module.exports = mongoose.model('User', userSchema);