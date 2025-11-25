const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
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
  permissions: [{
    resource: {
      type: String,
      required: true,
      enum: [
        'kyc',
        'properties',
        'investments',
        'users',
        'transactions',
        'documents',
        'analytics',
        'notifications',
        'settings',
        'admin'
      ]
    },
    actions: [{
      type: String,
      enum: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'manage', 'export']
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isSystemRole: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
roleSchema.index({ name: 1 });
roleSchema.index({ isActive: 1 });

// Method to check if role has specific permission
roleSchema.methods.hasPermission = function(resource, action) {
  const permission = this.permissions.find(p => p.resource === resource);
  return permission && permission.actions.includes(action);
};

// Static method to create default roles
roleSchema.statics.createDefaultRoles = async function() {
  const defaultRoles = [
    {
      name: 'super_admin',
      displayName: 'Super Administrator',
      description: 'Full system access with all permissions',
      isSystemRole: true,
      permissions: [
        { resource: 'kyc', actions: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'manage'] },
        { resource: 'properties', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
        { resource: 'investments', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
        { resource: 'users', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
        { resource: 'transactions', actions: ['view', 'create', 'edit', 'delete', 'manage', 'export'] },
        { resource: 'documents', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
        { resource: 'analytics', actions: ['view', 'export'] },
        { resource: 'notifications', actions: ['view', 'create', 'manage'] },
        { resource: 'settings', actions: ['view', 'edit', 'manage'] },
        { resource: 'admin', actions: ['view', 'manage'] }
      ]
    },
    {
      name: 'kyc_officer',
      displayName: 'KYC Officer',
      description: 'Responsible for KYC verification and approval',
      isSystemRole: true,
      permissions: [
        { resource: 'kyc', actions: ['view', 'approve', 'reject'] },
        { resource: 'users', actions: ['view'] },
        { resource: 'documents', actions: ['view'] },
        { resource: 'notifications', actions: ['view', 'create'] }
      ]
    },
    {
      name: 'operator',
      displayName: 'Operator',
      description: 'General operations and transaction management',
      isSystemRole: true,
      permissions: [
        { resource: 'properties', actions: ['view'] },
        { resource: 'investments', actions: ['view'] },
        { resource: 'transactions', actions: ['view', 'manage'] },
        { resource: 'users', actions: ['view'] },
        { resource: 'notifications', actions: ['view', 'create'] }
      ]
    },
    {
      name: 'property_manager',
      displayName: 'Property Manager',
      description: 'Manages properties and related operations',
      isSystemRole: true,
      permissions: [
        { resource: 'properties', actions: ['view', 'create', 'edit', 'manage'] },
        { resource: 'investments', actions: ['view'] },
        { resource: 'documents', actions: ['view', 'create'] },
        { resource: 'notifications', actions: ['view', 'create'] }
      ]
    },
    {
      name: 'analyst',
      displayName: 'Analyst',
      description: 'Access to analytics and reports',
      isSystemRole: true,
      permissions: [
        { resource: 'analytics', actions: ['view', 'export'] },
        { resource: 'properties', actions: ['view'] },
        { resource: 'investments', actions: ['view'] },
        { resource: 'transactions', actions: ['view', 'export'] },
        { resource: 'users', actions: ['view'] }
      ]
    }
  ];

  for (const roleData of defaultRoles) {
    await this.findOneAndUpdate(
      { name: roleData.name },
      roleData,
      { upsert: true, new: true }
    );
  }
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
