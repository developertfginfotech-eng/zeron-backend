const express = require('express');
const kycController = require('../controllers/kycController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const upload = require('../middleware/upload');

const router = express.Router();

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


// Get all KYC data - requires kyc:documents permission OR admin/kyc_officer role
router.get('/admin/all',
  authenticate,
  (req, res, next) => {
    // Super admin and KYC roles get full access
    if (['admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'].includes(req.user.role)) {
      return next();
    }
    // For other roles (team_lead, team_member), check permission
    checkPermission('kyc', 'view')(req, res, next);
  },
  kycController.getAllKYCData
);

// Update KYC status - requires kyc:approval permission OR admin/kyc_officer role
router.put('/admin/:kycId/status',
  authenticate,
  (req, res, next) => {
    // Super admin and KYC roles get full access
    if (['admin', 'super_admin', 'kyc_officer'].includes(req.user.role)) {
      return next();
    }
    // For other roles, check permission
    checkPermission('kyc', 'approval')(req, res, next);
  },
  kycController.updateKYCStatus
);
module.exports = router;