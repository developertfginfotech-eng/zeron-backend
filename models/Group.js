const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Department category for organizing groups
  department: {
    type: String,
    enum: [
      'kyc',
      'finance',
      'compliance',
      'operations',
      'property-management',
      'user-management',
      'analytics',
      'admin',
      'other'
    ],
    default: 'other'
  },
  // Permissions defined at group level
  permissions: [{
    resource: {
      type: String,
      required: true,
      enum: [
        // KYC Department
        'kyc',
        'kyc:verification',
        'kyc:approval',
        'kyc:documents',

        // Finance Department
        'finance',
        'finance:reports',
        'finance:investments',
        'finance:payouts',
        'finance:audits',

        // Compliance Department
        'compliance',
        'compliance:monitoring',
        'compliance:reports',
        'compliance:approvals',
        'compliance:policies',

        // Operations Department
        'operations',
        'operations:properties',
        'operations:transactions',
        'operations:support',
        'operations:maintenance',

        // Property Management
        'properties',
        'properties:create',
        'properties:edit',
        'properties:manage',
        'properties:documents',

        // User Management
        'users',
        'users:create',
        'users:edit',
        'users:deactivate',
        'users:reports',

        // Investments & Transactions
        'investments',
        'transactions',
        'transactions:manage',
        'transactions:approve',
        'transactions:dispute',

        // Documents & Records
        'documents',
        'documents:upload',
        'documents:verify',
        'documents:archive',

        // Analytics & Reporting
        'analytics',
        'analytics:view',
        'analytics:export',
        'analytics:generate',

        // System
        'notifications',
        'settings',
        'admin',
        'admin:users',
        'admin:roles',
        'admin:groups',
        'admin:security',
        'admin:logs'
      ]
    },
    actions: [{
      type: String,
      enum: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'manage', 'export', 'verify', 'archive']
    }]
  }],
  // Members of this group with individual permissions
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Individual member-level permissions (overrides group permissions)
    memberPermissions: [{
      resource: {
        type: String,
        enum: [
          // KYC Department
          'kyc',
          'kyc:verification',
          'kyc:approval',
          'kyc:documents',

          // Finance Department
          'finance',
          'finance:reports',
          'finance:investments',
          'finance:payouts',
          'finance:audits',

          // Compliance Department
          'compliance',
          'compliance:monitoring',
          'compliance:reports',
          'compliance:approvals',
          'compliance:policies',

          // Operations Department
          'operations',
          'operations:properties',
          'operations:transactions',
          'operations:support',
          'operations:maintenance',

          // Property Management
          'properties',
          'properties:create',
          'properties:edit',
          'properties:manage',
          'properties:documents',

          // User Management
          'users',
          'users:create',
          'users:edit',
          'users:deactivate',
          'users:reports',

          // Investments & Transactions
          'investments',
          'transactions',
          'transactions:manage',
          'transactions:approve',
          'transactions:dispute',

          // Documents & Records
          'documents',
          'documents:upload',
          'documents:verify',
          'documents:archive',

          // Analytics & Reporting
          'analytics',
          'analytics:view',
          'analytics:export',
          'analytics:generate',

          // System
          'notifications',
          'settings',
          'admin',
          'admin:users',
          'admin:roles',
          'admin:groups',
          'admin:security',
          'admin:logs'
        ]
      },
      actions: [{
        type: String,
        enum: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'manage', 'export', 'verify', 'archive']
      }]
    }],
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Optional: Assign roles to group members
  defaultRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for faster queries
groupSchema.index({ name: 1 });
groupSchema.index({ isActive: 1 });
groupSchema.index({ members: 1 });

// Method to check if group has specific permission
groupSchema.methods.hasPermission = function(resource, action) {
  const permission = this.permissions.find(p => p.resource === resource);
  return permission && permission.actions.includes(action);
};

// Method to add member to group with permissions
groupSchema.methods.addMember = async function(userId, memberPermissions = [], addedBy = null) {
  const memberExists = this.members.some(m => m.userId.toString() === userId.toString());

  if (!memberExists) {
    this.members.push({
      userId,
      memberPermissions,
      addedBy
    });
    await this.save();
  }
  return this;
};

// Method to remove member from group
groupSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.userId.toString() !== userId.toString());
  await this.save();
  return this;
};

// Method to update member permissions
groupSchema.methods.updateMemberPermissions = async function(userId, newPermissions) {
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  if (member) {
    member.memberPermissions = newPermissions;
    await this.save();
  }
  return this;
};

// Static method to get user's groups
groupSchema.statics.getUserGroups = async function(userId) {
  return this.find({
    members: userId,
    isActive: true
  }).populate('defaultRole');
};

// Static method to get user's combined permissions from all groups
groupSchema.statics.getUserPermissions = async function(userId) {
  const groups = await this.find({
    members: userId,
    isActive: true
  });

  const permissionsMap = new Map();

  // Combine permissions from all groups
  groups.forEach(group => {
    group.permissions.forEach(permission => {
      const key = permission.resource;
      if (!permissionsMap.has(key)) {
        permissionsMap.set(key, new Set());
      }
      permission.actions.forEach(action => {
        permissionsMap.get(key).add(action);
      });
    });
  });

  // Convert Map to array format
  const combinedPermissions = [];
  permissionsMap.forEach((actions, resource) => {
    combinedPermissions.push({
      resource,
      actions: Array.from(actions)
    });
  });

  return combinedPermissions;
};

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
