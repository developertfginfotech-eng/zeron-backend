const express = require('express');
const User = require('../models/User');
const kycController = require('../controllers/kycController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Middleware to check KYC view permission (group-based)
const checkKYCViewPermission = async (req, res, next) => {
  try {
    // Super admin gets automatic access
    if (req.user?.role === 'super_admin') {
      return next();
    }

    // For all other roles, check if user has KYC view permission in their groups
    const user = await User.findById(req.user.id).populate('groups');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Check if user has any of these permissions: kyc:documents, kyc:verification, or kyc:approval
    const hasKYCPermission =
      (await user.hasPermission('kyc:documents', 'view')) ||
      (await user.hasPermission('kyc:verification', 'view')) ||
      (await user.hasPermission('kyc:approval', 'view'));

    if (!hasKYCPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access KYC documents',
        required: { resources: ['kyc:documents', 'kyc:verification', 'kyc:approval'], action: 'view' }
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
    // Super admin gets automatic access
    if (req.user?.role === 'super_admin') {
      return next();
    }

    // For all other roles, check if user has kyc approval permission in their groups
    const user = await User.findById(req.user.id).populate('groups');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Check if user has approval permission from any KYC resource (kyc:approval or kyc:verification)
    const permissions = await user.getPermissions();
    const kycApprovalPerms = permissions.find(p => p.resource === 'kyc:approval');
    const kycVerificationPerms = permissions.find(p => p.resource === 'kyc:verification');

    const hasApprovalPermission =
      (kycApprovalPerms && (
        kycApprovalPerms.actions.includes('edit') ||
        kycApprovalPerms.actions.includes('approve') ||
        kycApprovalPerms.actions.includes('reject')
      )) ||
      (kycVerificationPerms && (
        kycVerificationPerms.actions.includes('edit') ||
        kycVerificationPerms.actions.includes('approve') ||
        kycVerificationPerms.actions.includes('reject')
      ));

    if (!hasApprovalPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve KYC applications',
        required: { resources: ['kyc:approval', 'kyc:verification'], action: 'edit, approve, or reject' }
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