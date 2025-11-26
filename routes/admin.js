const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const { body, query } = require('express-validator');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Public property browsing - no authentication required
router.get('/properties', adminController.getProperties);

// Get specific property (public)
router.get('/properties/:id', adminController.getPropertyById);

// Apply authentication to all remaining admin routes
router.use(authenticate);

// Base authorization for admin routes (all admin roles can access unless specified)
router.use(authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'));
router.get('/all-users', adminController.getAllRegularUsers);
// ========== ADMIN USER MANAGEMENT ROUTES ==========

// Get all admin users
router.get('/admin-users', adminController.getAdminUsers);

// Get specific admin user details (super admin only)
router.get('/admin-users/:id', authorize('super_admin'), adminController.getAdminUserDetails);

// Update admin user details (super admin only, requires OTP)
router.put('/admin-users/:id/details', authorize('super_admin'), [
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().withMessage('Valid email required'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive')
], adminController.updateAdminUserDetails);

// Deactivate admin user (super admin only, requires OTP)
router.put('/admin-users/:id/deactivate', authorize('super_admin'), adminController.deactivateAdminUser);

// Reactivate admin user (super admin only)
router.put('/admin-users/:id/reactivate', authorize('super_admin'), adminController.reactivateAdminUser);

// ========== ROLE MANAGEMENT ROUTES ==========

// Promote user to super admin (super admin only, requires OTP)
router.put('/admin-users/:id/promote-super-admin', authorize('super_admin'), adminController.promoteToSuperAdmin);

// Update admin user role (super admin only, requires OTP)
router.put('/admin-users/:id/role', authorize('super_admin'), [
  body('role').isIn(['admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer']).withMessage('Invalid role')
], adminController.updateAdminRole);

// ========== USER PROMOTION ROUTES ==========

// Get eligible users for promotion to admin (super admin only)
router.get('/eligible-users', authorize('super_admin'), adminController.getEligibleUsers);

// Promote regular user to admin role (super admin only, requires OTP)
router.post('/promote-user', authorize('super_admin'), [
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('role').isIn(['admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer']).withMessage('Invalid admin role')
], adminController.promoteUserToAdmin);

// ========== REGULAR USER MANAGEMENT ROUTES ==========

// Get all regular users
router.get('/users', adminController.getAllUsers);

// Update user KYC status (super admin and KYC officers)
router.put('/users/:id/kyc-status', authorize('super_admin', 'kyc_officer'), [
  body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid KYC status')
], adminController.updateKycStatus);

// ========== PROPERTY MANAGEMENT ROUTES ==========



// Create new property (super admin and property managers, requires OTP)
router.post('/properties', authorize('super_admin', 'property_manager'), upload.array('images', 10), adminController.createProperty);

// Update property (super admin and property managers, requires OTP)
router.patch('/properties/:id', authorize('super_admin', 'property_manager'), upload.array('images', 10), adminController.updateProperty);

// Delete property (super admin and property managers, requires OTP)
router.delete('/properties/:id', authorize('super_admin', 'property_manager'), adminController.deleteProperty);

// ========== DASHBOARD AND REPORTS ==========

// Get admin dashboard data
router.get('/dashboard', adminController.getDashboard);

// Get active investors list
router.get('/investors', adminController.getActiveInvestors);

// Get specific investor by ID
router.get('/investors/:id', adminController.getInvestorById);

// Get OTP status for current user
router.get('/otp-status', adminController.getOTPStatus);

// Get transactions and withdrawal data
router.get('/transactions', authorize('super_admin', 'financial_analyst'), [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'approved', 'rejected']).withMessage('Invalid status'),
  query('type').optional().isIn(['investment', 'payout', 'withdrawal', 'dividend']).withMessage('Invalid type'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).toInt().withMessage('Offset must be at least 0')
], adminController.getTransactions);

// Get analytics and platform insights
router.get('/analytics', authorize('super_admin', 'financial_analyst'), [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('range').optional().isIn(['7days', '30days', '90days', '1year']).withMessage('Invalid date range')
], adminController.getAnalytics);

// Get earnings report (super admin and financial analysts)
router.get('/reports/earnings', authorize('super_admin', 'financial_analyst'), [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('propertyId').optional().isMongoId().withMessage('Invalid property ID'),
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv')
], adminController.getEarningsReport);



router.post('/admin-users', authorize('super_admin'), [
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
  body('email').isEmail(),
  body('role').isIn(['admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer']),
  body('password').optional().isLength({ min: 8 })
], adminController.createAdminUser);

// ========== RBAC - ROLE MANAGEMENT ROUTES (Super Admin Only) ==========

// Get all roles
router.get('/roles', authorize('super_admin'), adminController.getRoles);

// Get specific role by ID
router.get('/roles/:id', authorize('super_admin'), adminController.getRoleById);

// Create new role
router.post('/roles', authorize('super_admin'), [
  body('name').trim().isLength({ min: 2 }).withMessage('Role name must be at least 2 characters'),
  body('displayName').trim().isLength({ min: 2 }).withMessage('Display name must be at least 2 characters'),
  body('description').optional().trim(),
  body('permissions').isArray().withMessage('Permissions must be an array')
], adminController.createRole);

// Update role
router.put('/roles/:id', authorize('super_admin'), [
  body('displayName').optional().trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('permissions').optional().isArray()
], adminController.updateRole);

// Delete role (only if no users assigned)
router.delete('/roles/:id', authorize('super_admin'), adminController.deleteRole);

// Assign role to user
router.post('/users/:userId/assign-role', authorize('super_admin'), [
  body('roleId').isMongoId().withMessage('Valid role ID required')
], adminController.assignRoleToUser);

// Remove role from user
router.delete('/users/:userId/remove-role', authorize('super_admin'), adminController.removeRoleFromUser);

// ========== RBAC - GROUP MANAGEMENT ROUTES (Super Admin Only) ==========

// Get all groups
router.get('/groups', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), adminController.getGroups);

// Get specific group by ID with members
router.get('/groups/:id', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), adminController.getGroupById);

// Create new group
router.post('/groups', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), [
  body('name').trim().isLength({ min: 2 }).withMessage('Group name must be at least 2 characters'),
  body('displayName').trim().isLength({ min: 2 }).withMessage('Display name must be at least 2 characters'),
  body('description').optional().trim(),
  body('department').optional().trim(),
  body('permissions').isArray().withMessage('Permissions must be an array'),
  body('defaultRole').optional().isMongoId().withMessage('Valid role ID required')
], adminController.createGroup);

// Update group
router.put('/groups/:id', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), [
  body('displayName').optional().trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('department').optional().trim(),
  body('permissions').optional().isArray(),
  body('defaultRole').optional().isMongoId()
], adminController.updateGroup);

// Delete group
router.delete('/groups/:id', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), adminController.deleteGroup);

// Add user to group
router.post('/groups/:groupId/add-member', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), [
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('memberPermissions').optional().isArray().withMessage('Member permissions must be an array')
], adminController.addUserToGroup);

// Remove user from group
router.delete('/groups/:groupId/remove-member/:userId', authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'), adminController.removeUserFromGroup);

// Get all users with their roles and groups
router.get('/rbac/users', authorize('super_admin'), adminController.getUsersWithRBAC);

// Get user's effective permissions
router.get('/users/:userId/permissions', authorize('super_admin'), adminController.getUserPermissions);

// Initialize default roles (one-time setup)
router.post('/rbac/initialize', authorize('super_admin'), adminController.initializeDefaultRoles);

module.exports = router;