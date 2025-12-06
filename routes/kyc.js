const express = require('express');
const User = require('../models/User');
const kycController = require('../controllers/kycController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Middleware to check KYC view permission (group-based)
const checkKYCViewPermission = async (req, res, next) => {
  try {
    // Super admin and KYC roles get automatic access
    if (['admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'].includes(req.user.role)) {
      return next();
    }

    // For other roles, check if user has kyc:documents permission in their groups
    const user = await User.findById(req.user.id).populate('groups');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Check if user has kyc:documents permission
    const hasKYCPermission = await user.hasPermission('kyc:documents', 'view');

    if (!hasKYCPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access KYC documents',
        required: { resource: 'kyc:documents', action: 'view' }
      });
    }

    next();
  } catch (error) {
    console.error('KYC permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking KYC permissions',
      error: error.message
    });
  }
};

// Middleware to check KYC approval permission (group-based)
const checkKYCApprovalPermission = async (req, res, next) => {
  try {
    // Super admin and KYC officer get automatic access
    if (['admin', 'super_admin', 'kyc_officer'].includes(req.user.role)) {
      return next();
    }

    // For other roles, check if user has kyc:approval permission in their groups
    const user = await User.findById(req.user.id).populate('groups');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Check if user has kyc:approval permission
    const hasApprovalPermission = await user.hasPermission('kyc:approval', 'edit');

    if (!hasApprovalPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve KYC applications',
        required: { resource: 'kyc:approval', action: 'edit' }
      });
    }

    next();
  } catch (error) {
    console.error('KYC approval permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking KYC approval permissions',
      error: error.message
    });
  }
};

router.post('/upload',
  authenticate,
  ...upload.fields([
    { name: 'nationalId', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'proofOfIncome', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 }
  ]),
  kycController.uploadDocuments
);

router.get('/',
  authenticate,
  kycController.getKYCData
);


// Get all KYC data - requires kyc:documents permission in group OR admin/kyc_officer role
router.get('/admin/all',
  authenticate,
  checkKYCViewPermission,
  kycController.getAllKYCData
);

// Update KYC status - requires kyc:approval permission in group OR admin/kyc_officer role
router.put('/admin/:kycId/status',
  authenticate,
  checkKYCApprovalPermission,
  kycController.updateKYCStatus
);
module.exports = router;