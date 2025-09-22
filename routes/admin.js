const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const { body, query } = require('express-validator');

// Configure multer
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

// Use real authentication middleware instead of simpleAuth
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// Admin role management routes
router.get('/admin-users', adminController.getAdminUsers);
router.post('/admin-users', [
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
  body('email').isEmail(),
  body('role').isIn(['admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer']),
  body('password').isLength({ min: 8 })
], adminController.createAdminUser);
router.post('/admin-users/:id/promote-super-admin', adminController.promoteToSuperAdmin);
router.put('/admin-users/:id/role', adminController.updateAdminRole);

// User management routes
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/kyc-status', [
  body('status').isIn(['pending', 'approved', 'rejected'])
], adminController.updateKycStatus);

// Property management routes
router.get('/properties', adminController.getProperties);
router.post('/properties', upload.array('images', 10), adminController.createProperty);
router.patch('/properties/:id', upload.array('images', 10), adminController.updateProperty);
router.delete('/properties/:id', adminController.deleteProperty);
router.get('/properties/:id', adminController.getPropertyById);

// Other routes
router.get('/dashboard', adminController.getDashboard);
router.get('/otp-status', adminController.getOTPStatus);

module.exports = router;