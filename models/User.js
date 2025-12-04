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
    required: [true, 'Phone number is required'],
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
    enum: ['user', 'admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer', 'team_lead', 'team_member'],
    default: 'user'
  },
  // Enhanced RBAC system
  assignedRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  position: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending', 'pending_verification', 'inactive'],
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
    totalUnitsOwned: {
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
  }],

  // Profile completion data from wizard
  profileData: {
    investmentProfile: {
      experience: String,
      riskTolerance: String,
      investmentGoals: String,
      preferredTypes: [String],
      investmentAmount: String,
      timeline: String,
      completed: { type: Boolean, default: false }
    },
    bankingDetails: {
      bankName: String,
      iban: String,
      accountHolder: String,
      swiftCode: String,
      accountType: String,
      completed: { type: Boolean, default: false }
    },
    communicationPreferences: {
      emailNotifications: Boolean,
      smsAlerts: Boolean,
      languagePreference: String,
      timezone: String,
      marketingEmails: Boolean,
      monthlyReports: Boolean,
      completed: { type: Boolean, default: false }
    },
    employmentPortfolio: {
      employmentStatus: String,
      employer: String,
      jobTitle: String,
      monthlySalary: String,
      hasInvestmentPortfolio: Boolean,
      portfolioValue: String,
      completed: { type: Boolean, default: false }
    },
    profileCompleted: { type: Boolean, default: false },
    profileCompletedAt: Date
  }
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

// RBAC Methods
userSchema.methods.getPermissions = async function() {
  const Group = mongoose.model('Group');

  // Get permissions from all groups user belongs to
  const groupPermissions = await Group.getUserPermissions(this._id);

  // Get permissions from assigned role if exists
  let rolePermissions = [];
  if (this.assignedRole) {
    await this.populate('assignedRole');
    if (this.assignedRole && this.assignedRole.permissions) {
      rolePermissions = this.assignedRole.permissions;
    }
  }

  // Combine permissions from role and groups
  const permissionsMap = new Map();

  [...rolePermissions, ...groupPermissions].forEach(permission => {
    const key = permission.resource;
    if (!permissionsMap.has(key)) {
      permissionsMap.set(key, new Set());
    }
    permission.actions.forEach(action => {
      permissionsMap.get(key).add(action);
    });
  });

  // Convert to array format
  const combinedPermissions = [];
  permissionsMap.forEach((actions, resource) => {
    combinedPermissions.push({
      resource,
      actions: Array.from(actions)
    });
  });

  return combinedPermissions;
};

userSchema.methods.hasPermission = async function(resource, action) {
  // Super admin has all permissions
  if (this.role === 'super_admin') {
    return true;
  }

  const permissions = await this.getPermissions();
  const permission = permissions.find(p => p.resource === resource);
  return permission && permission.actions.includes(action);
};

userSchema.methods.addToGroup = async function(groupId) {
  const Group = mongoose.model('Group');

  if (!this.groups.includes(groupId)) {
    this.groups.push(groupId);
    await this.save();

    // Also add to group's members
    const group = await Group.findById(groupId);
    if (group) {
      await group.addMember(this._id);
    }
  }
  return this;
};

userSchema.methods.removeFromGroup = async function(groupId) {
  const Group = mongoose.model('Group');

  this.groups = this.groups.filter(id => id.toString() !== groupId.toString());
  await this.save();

  // Also remove from group's members
  const group = await Group.findById(groupId);
  if (group) {
    await group.removeMember(this._id);
  }
  return this;
};

module.exports = mongoose.model('User', userSchema);