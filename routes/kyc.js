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

    // For all other roles, check if user has KYC permission in their groups
    const user = await User.findById(req.user.id).populate('groups');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Check if user has view, approve, or reject permission
    // (Users need to view applications to approve/reject them)
    const hasKYCPermission =
      (await user.hasPermission('kyc:documents', 'view')) ||
      (await user.hasPermission('kyc:verification', 'view')) ||
      (await user.hasPermission('kyc:verification', 'approve')) ||
      (await user.hasPermission('kyc:verification', 'reject'));

    if (!hasKYCPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access KYC documents',
        required: {
          resources: ['kyc:documents', 'kyc:verification'],
          actions: ['view', 'approve', 'or reject']
        }
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

    // Get the status being set to determine required permission
    const { status } = req.body;

    // Check if user has the specific permission based on the action
    const permissions = await user.getPermissions();
    const kycVerificationPerms = permissions.find(p => p.resource === 'kyc:verification');
    const kycDocumentsPerms = permissions.find(p => p.resource === 'kyc:documents');

    let hasRequiredPermission = false;
    let requiredAction = '';

    // Determine required permission based on status
    if (status === 'approved') {
      requiredAction = 'approve';
      hasRequiredPermission =
        (kycVerificationPerms && (
          kycVerificationPerms.actions.includes('edit') ||
          kycVerificationPerms.actions.includes('approve')
        )) ||
        (kycDocumentsPerms && (
          kycDocumentsPerms.actions.includes('edit') ||
          kycDocumentsPerms.actions.includes('approve')
        ));
    } else if (status === 'rejected') {
      requiredAction = 'reject';
      hasRequiredPermission =
        (kycVerificationPerms && (
          kycVerificationPerms.actions.includes('edit') ||
          kycVerificationPerms.actions.includes('reject')
        )) ||
        (kycDocumentsPerms && (
          kycDocumentsPerms.actions.includes('edit') ||
          kycDocumentsPerms.actions.includes('reject')
        ));
    } else {
      // For other statuses (under_review, pending), require edit permission
      requiredAction = 'edit';
      hasRequiredPermission =
        (kycVerificationPerms && kycVerificationPerms.actions.includes('edit')) ||
        (kycDocumentsPerms && kycDocumentsPerms.actions.includes('edit'));
    }

    if (!hasRequiredPermission) {
      return res.status(403).json({
        success: false,
        message: `You do not have permission to ${requiredAction} KYC applications`,
        required: { resources: ['kyc:verification', 'kyc:documents'], action: requiredAction }
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

// Update KYC status - requires kyc:verification permission in group OR admin/kyc_officer role
router.put('/admin/:kycId/status',
  authenticate,
  checkKYCApprovalPermission,
  kycController.updateKYCStatus
);
module.exports = router;