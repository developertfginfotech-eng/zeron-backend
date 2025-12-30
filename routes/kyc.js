const express = require('express');
const kycController = require('../controllers/kycController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Middleware to check KYC view permission (group-based)
const checkKYCViewPermission = async (req, res, next) => {
  try {
    // ONLY Super admin gets automatic access
    if (req.user?.role === 'super_admin') {
      return next();
    }

    // For ALL other roles (admin, team_lead, team_member), check group membership
    const Group = require('../models/Group');
    const userGroups = await Group.find({
      'members.userId': req.user.id,
      isActive: true
    });

    // User MUST be a member of at least one group
    if (!userGroups || userGroups.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You must be assigned to a group with KYC permissions to access KYC documents',
        required: {
          note: 'Please contact your super administrator to be added to a group with KYC permissions'
        }
      });
    }

    // Get permissions ONLY from groups (not from assigned role)
    const groupPermissions = await Group.getUserPermissions(req.user.id);

    // Check if user has view permission from their groups
    const hasKYCViewPermission = groupPermissions.some(perm =>
      (perm.resource === 'kyc:documents' || perm.resource === 'kyc:verification') &&
      perm.actions.includes('view')
    );

    if (!hasKYCViewPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view KYC documents. Your group must have view permission on kyc:verification or kyc:documents',
        required: {
          resources: ['kyc:documents', 'kyc:verification'],
          action: 'view'
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
    // ONLY Super admin gets automatic access
    if (req.user?.role === 'super_admin') {
      return next();
    }

    // For ALL other roles (admin, team_lead, team_member), check group membership
    const Group = require('../models/Group');
    const userGroups = await Group.find({
      'members.userId': req.user.id,
      isActive: true
    });

    // User MUST be a member of at least one group
    if (!userGroups || userGroups.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You must be assigned to a group with KYC permissions to approve/reject KYC documents',
        required: {
          note: 'Please contact your super administrator to be added to a group with KYC permissions'
        }
      });
    }

    // Get permissions ONLY from groups (not from assigned role)
    const groupPermissions = await Group.getUserPermissions(req.user.id);

    // Get the status being set to determine required permission
    const { status } = req.body;

    let requiredAction = '';
    let hasRequiredPermission = false;

    // Determine required permission based on status
    if (status === 'approved') {
      requiredAction = 'approve';
      // Check for EXACT 'approve' permission (not 'reject' or 'edit')
      hasRequiredPermission = groupPermissions.some(perm =>
        (perm.resource === 'kyc:verification' || perm.resource === 'kyc:documents') &&
        perm.actions.includes('approve')
      );
    } else if (status === 'rejected') {
      requiredAction = 'reject';
      // Check for EXACT 'reject' permission (not 'approve' or 'edit')
      hasRequiredPermission = groupPermissions.some(perm =>
        (perm.resource === 'kyc:verification' || perm.resource === 'kyc:documents') &&
        perm.actions.includes('reject')
      );
    } else {
      // For other statuses (under_review, pending), require edit permission
      requiredAction = 'edit';
      hasRequiredPermission = groupPermissions.some(perm =>
        (perm.resource === 'kyc:verification' || perm.resource === 'kyc:documents') &&
        perm.actions.includes('edit')
      );
    }

    if (!hasRequiredPermission) {
      return res.status(403).json({
        success: false,
        message: `You do not have permission to ${requiredAction} KYC applications. Your group must have ${requiredAction} permission on kyc:verification or kyc:documents`,
        required: {
          resources: ['kyc:verification', 'kyc:documents'],
          action: requiredAction
        }
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