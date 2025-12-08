const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission, requireSuperAdmin, checkKycPermission } = require('../middleware/permissions');
const cloudinaryUpload = require('../middleware/cloudinary-upload');
const { body, query } = require('express-validator');

// Get all properties - requires properties view permission or super admin
router.get('/properties', (req, res, next) => {
  // If no authentication, treat as public listing
  if (!req.user) {
    return adminController.getProperties(req, res);
  }
  // If authenticated but not super admin, check permissions
  if (req.user?.role !== 'super_admin') {
    return checkPermission('properties', 'view')(req, res, next);
  }
  next();
}, adminController.getProperties);

// Get specific property - requires properties view permission or super admin
router.get('/properties/:id', (req, res, next) => {
  // If no authentication, treat as public listing
  if (!req.user) {
    return adminController.getPropertyById(req, res);
  }
  // If authenticated but not super admin, check permissions
  if (req.user?.role !== 'super_admin') {
    return checkPermission('properties', 'view')(req, res, next);
  }
  next();
}, adminController.getPropertyById);

// Get security settings (public - read-only)
router.get('/security-settings', adminController.getSecuritySettings);

// Apply authentication to all admin routes
router.use(authenticate);

// ========== SUPER ADMIN ONLY - ADMIN CREATION ==========
// Register new admin (super admin only - creates new admin users)
router.post('/admin-users', requireSuperAdmin, [
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().withMessage('Valid email required'),
  body('phone').matches(/^(\+966|966|0)?[5-9]\d{8}$/).withMessage('Valid Saudi phone number required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').optional().isIn(['admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer', 'team_lead', 'team_member']).withMessage('Invalid role'),
  body('position').optional().trim()
], adminController.createAdminUser);

// ========== ADMIN USER MANAGEMENT ROUTES ==========

// Get all admin users - super admin only
router.get('/admin-users', requireSuperAdmin, adminController.getAdminUsers);

// Get all regular users - requires user management permission or super admin
router.get('/all-users', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('users', 'view')(req, res, next);
}, adminController.getAllRegularUsers);

// Get pending admins (awaiting verification) - super admin only
router.get('/admin-users/pending/list', requireSuperAdmin, adminController.getPendingAdmins);

// Verify/Approve a pending admin (super admin only)
router.post('/admin-users/:id/verify', requireSuperAdmin, [
  body('approved').isBoolean().withMessage('Approved must be boolean')
], adminController.verifyAdmin);

// Get specific admin user details (super admin only)
router.get('/admin-users/:id', requireSuperAdmin, adminController.getAdminUserDetails);

// Update admin user details (super admin only, requires OTP)
router.put('/admin-users/:id/details', requireSuperAdmin, [
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().withMessage('Valid email required'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive')
], adminController.updateAdminUserDetails);

// Deactivate admin user (super admin only, requires OTP)
router.put('/admin-users/:id/deactivate', requireSuperAdmin, adminController.deactivateAdminUser);

// Reactivate admin user (super admin only)
router.put('/admin-users/:id/reactivate', requireSuperAdmin, adminController.reactivateAdminUser);

// ========== ROLE MANAGEMENT ROUTES ==========

// Promote user to super admin (super admin only, requires OTP)
router.put('/admin-users/:id/promote-super-admin', requireSuperAdmin, adminController.promoteToSuperAdmin);

// Update admin user role (super admin only, requires OTP)
router.put('/admin-users/:id/role', requireSuperAdmin, [
  body('role').isIn(['admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer', 'team_lead', 'team_member']).withMessage('Invalid role')
], adminController.updateAdminRole);

// Delete admin user (super admin only)
router.delete('/admin-users/:id', requireSuperAdmin, adminController.deleteAdminUser);

// ========== USER PROMOTION ROUTES ==========

// Get eligible users for promotion to admin (super admin only)
router.get('/eligible-users', requireSuperAdmin, adminController.getEligibleUsers);

// Promote regular user to admin role (super admin only, requires OTP)
router.post('/promote-user', requireSuperAdmin, [
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('role').isIn(['admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer']).withMessage('Invalid admin role')
], adminController.promoteUserToAdmin);

// ========== REGULAR USER MANAGEMENT ROUTES ==========

// Get all regular users - requires user view permission or super admin
router.get('/users', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('users', 'view')(req, res, next);
}, adminController.getAllUsers);

// Update user KYC status (requires specific permission based on action: approve/reject/manage)
router.put('/users/:id/kyc-status', checkKycPermission, [
  body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid KYC status')
], adminController.updateKycStatus);

// ========== PROPERTY MANAGEMENT ROUTES ==========

// Create new property (requires properties create permission or super admin)
router.post('/properties', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('properties', 'create')(req, res, next);
}, ...cloudinaryUpload.single('image'), adminController.createProperty);

// Update property (requires properties edit permission or super admin)
router.patch('/properties/:id', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('properties', 'edit')(req, res, next);
}, ...cloudinaryUpload.single('image'), adminController.updateProperty);

// Delete property (requires properties delete permission or super admin)
router.delete('/properties/:id', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('properties', 'delete')(req, res, next);
}, adminController.deleteProperty);

// ========== DASHBOARD AND REPORTS ==========

// Get admin dashboard data - available to all authenticated admin users
router.get('/dashboard', adminController.getDashboard);

// Get active investors list - requires users view permission or super admin
router.get('/investors', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('users', 'view')(req, res, next);
}, adminController.getActiveInvestors);

// Get specific investor by ID - requires users view permission or super admin
router.get('/investors/:id', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('users', 'view')(req, res, next);
}, adminController.getInvestorById);

// Get OTP status for current user
router.get('/otp-status', adminController.getOTPStatus);

// Get transactions and withdrawal data - requires financial view permission or super admin
router.get('/transactions', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('transactions', 'view')(req, res, next);
}, [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'approved', 'rejected']).withMessage('Invalid status'),
  query('type').optional().isIn(['investment', 'payout', 'withdrawal', 'dividend']).withMessage('Invalid type'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).toInt().withMessage('Offset must be at least 0')
], adminController.getTransactions);

// Get analytics and platform insights - requires analytics view permission or super admin
router.get('/analytics', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('analytics', 'view')(req, res, next);
}, [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('range').optional().isIn(['7days', '30days', '90days', '1year']).withMessage('Invalid date range')
], adminController.getAnalytics);

// Get earnings report (requires analytics/finance view permission or super admin)
router.get('/reports/earnings', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('analytics', 'view')(req, res, next);
}, [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('propertyId').optional().isMongoId().withMessage('Invalid property ID'),
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv')
], adminController.getEarningsReport);

// ========== RBAC - ROLE MANAGEMENT ROUTES (Super Admin Only) ==========

// Get all roles
router.get('/roles', requireSuperAdmin, adminController.getRoles);

// Get specific role by ID
router.get('/roles/:id', requireSuperAdmin, adminController.getRoleById);

// Create new role
router.post('/roles', requireSuperAdmin, [
  body('name').trim().isLength({ min: 2 }).withMessage('Role name must be at least 2 characters'),
  body('displayName').trim().isLength({ min: 2 }).withMessage('Display name must be at least 2 characters'),
  body('description').optional().trim(),
  body('permissions').isArray().withMessage('Permissions must be an array')
], adminController.createRole);

// Update role
router.put('/roles/:id', requireSuperAdmin, [
  body('displayName').optional().trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('permissions').optional().isArray()
], adminController.updateRole);

// Delete role (only if no users assigned)
router.delete('/roles/:id', requireSuperAdmin, adminController.deleteRole);

// Assign role to user
router.post('/users/:userId/assign-role', requireSuperAdmin, [
  body('roleId').isMongoId().withMessage('Valid role ID required')
], adminController.assignRoleToUser);

// Remove role from user
router.delete('/users/:userId/remove-role', requireSuperAdmin, adminController.removeRoleFromUser);

// ========== RBAC - GROUP MANAGEMENT ROUTES ==========

// Get all groups - requires admin permission or super admin
router.get('/groups', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('admin', 'view')(req, res, next);
}, adminController.getGroups);

// Get specific group by ID with members - requires admin permission or super admin
router.get('/groups/:id', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('admin', 'view')(req, res, next);
}, adminController.getGroupById);

// Create new group - requires admin manage permission or super admin
router.post('/groups', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('admin', 'manage')(req, res, next);
}, [
  body('name').trim().isLength({ min: 2 }).withMessage('Group name must be at least 2 characters'),
  body('displayName').trim().isLength({ min: 2 }).withMessage('Display name must be at least 2 characters'),
  body('description').optional().trim(),
  body('department').optional().trim(),
  body('permissions').isArray().withMessage('Permissions must be an array'),
  body('defaultRole').optional().isMongoId().withMessage('Valid role ID required'),
  body('parentGroupId').optional().isMongoId().withMessage('Valid parent group ID required'),
  body('overriddenPermissions').optional().isArray().withMessage('Overridden permissions must be an array')
], adminController.createGroup);

// Update group - requires admin manage permission or super admin
router.put('/groups/:id', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('admin', 'manage')(req, res, next);
}, [
  body('displayName').optional().trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('department').optional().trim(),
  body('permissions').optional().isArray(),
  body('defaultRole').optional().isMongoId()
], adminController.updateGroup);

// Delete group - requires admin manage permission or super admin
router.delete('/groups/:id', (req, res, next) => {
  if (req.user?.role === 'super_admin') {
    return next();
  }
  return checkPermission('admin', 'manage')(req, res, next);
}, adminController.deleteGroup);

// Add user to group - allows team leads to add to their own sub-groups
router.post('/groups/:groupId/add-member', async (req, res, next) => {
  try {
    // Super admin and admin can always add members
    if (['super_admin', 'admin'].includes(req.user?.role)) {
      return next();
    }

    // For team leads, check if they are a member of this group
    if (req.user?.role === 'team_lead') {
      const User = require('../models/User');
      const Group = require('../models/Group');

      const user = await User.findById(req.user.id).populate('groups');
      const group = await Group.findById(req.params.groupId);

      if (!group) {
        return res.status(404).json({ success: false, message: 'Group not found' });
      }

      // Check if team lead is a member of this group or its parent
      const isMemberOfGroup = user.groups?.some(g =>
        g._id.toString() === req.params.groupId ||
        g._id.toString() === group.parentGroupId?.toString()
      );

      if (!isMemberOfGroup) {
        return res.status(403).json({
          success: false,
          message: 'You can only add members to your own sub-groups'
        });
      }

      return next();
    }

    // For other roles, check admin:manage permission
    return checkPermission('admin', 'manage')(req, res, next);
  } catch (error) {
    console.error('Add member authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking authorization',
      error: error.message
    });
  }
}, [
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('memberPermissions').optional().isArray().withMessage('Member permissions must be an array')
], adminController.addUserToGroup);

// Remove user from group - allows team leads to remove from their own sub-groups
router.delete('/groups/:groupId/remove-member/:userId', async (req, res, next) => {
  try {
    // Super admin and admin can always remove members
    if (['super_admin', 'admin'].includes(req.user?.role)) {
      return next();
    }

    // For team leads, check if they are a member of this group
    if (req.user?.role === 'team_lead') {
      const User = require('../models/User');
      const Group = require('../models/Group');

      const user = await User.findById(req.user.id).populate('groups');
      const group = await Group.findById(req.params.groupId);

      if (!group) {
        return res.status(404).json({ success: false, message: 'Group not found' });
      }

      // Check if team lead is a member of this group or its parent
      const isMemberOfGroup = user.groups?.some(g =>
        g._id.toString() === req.params.groupId ||
        g._id.toString() === group.parentGroupId?.toString()
      );

      if (!isMemberOfGroup) {
        return res.status(403).json({
          success: false,
          message: 'You can only remove members from your own sub-groups'
        });
      }

      return next();
    }

    // For other roles, check admin:manage permission
    return checkPermission('admin', 'manage')(req, res, next);
  } catch (error) {
    console.error('Remove member authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking authorization',
      error: error.message
    });
  }
}, adminController.removeUserFromGroup);

// Update member permissions within a group - allows team leads to update their own sub-group members
router.put('/groups/:groupId/members/:userId/permissions', async (req, res, next) => {
  try {
    // Super admin and admin can always update permissions
    if (['super_admin', 'admin'].includes(req.user?.role)) {
      return next();
    }

    // For team leads, check if they are a member of this group
    if (req.user?.role === 'team_lead') {
      const User = require('../models/User');
      const Group = require('../models/Group');

      const user = await User.findById(req.user.id).populate('groups');
      const group = await Group.findById(req.params.groupId);

      if (!group) {
        return res.status(404).json({ success: false, message: 'Group not found' });
      }

      // Check if team lead is a member of this group or its parent
      const isMemberOfGroup = user.groups?.some(g =>
        g._id.toString() === req.params.groupId ||
        g._id.toString() === group.parentGroupId?.toString()
      );

      if (!isMemberOfGroup) {
        return res.status(403).json({
          success: false,
          message: 'You can only update permissions for members in your own sub-groups'
        });
      }

      return next();
    }

    // For other roles, check admin:manage permission
    return checkPermission('admin', 'manage')(req, res, next);
  } catch (error) {
    console.error('Update member permissions authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking authorization',
      error: error.message
    });
  }
}, [
  body('memberPermissions').optional().isArray().withMessage('Member permissions must be an array')
], adminController.updateMemberPermissions);

// Get all users with their roles and groups
router.get('/rbac/users', requireSuperAdmin, adminController.getUsersWithRBAC);

// Get user's effective permissions
router.get('/users/:userId/permissions', requireSuperAdmin, adminController.getUserPermissions);

// Initialize default roles (one-time setup)
router.post('/rbac/initialize', requireSuperAdmin, adminController.initializeDefaultRoles);

// Update security settings (super admin only)
router.put('/security-settings', requireSuperAdmin, adminController.updateSecuritySettings);

// ========== NOTIFICATIONS ROUTES ==========

// Get all notifications for current admin
router.get('/notifications', adminController.getNotifications);

// Mark specific notification as read
router.put('/notifications/:id/read', adminController.markNotificationAsRead);

// Mark all notifications as read for current user
router.put('/notifications/mark-all-read', adminController.markAllNotificationsAsRead);

// Create and send notification to users
router.post('/notifications', requireSuperAdmin, [
  body('title').trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters'),
  body('type').optional().isIn(['info', 'success', 'warning', 'error', 'system_announcement', 'app_update', 'policy_change']).withMessage('Invalid notification type'),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Invalid priority level'),
  body('targetUsers').optional().isArray().withMessage('Target users must be an array')
], adminController.createNotification);

module.exports = router;