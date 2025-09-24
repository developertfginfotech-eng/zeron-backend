const express = require('express');
const kycController = require('../controllers/kycController');
const { authenticate, authorize } = require('../middleware/auth'); 
const upload = require('../middleware/upload');

const router = express.Router();

router.post('/upload', 
  authenticate,
  upload.fields([
    { name: 'nationalId', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'proofOfIncome', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 }
  ]),
  kycController.uploadDocuments
);
router.get('/', authenticate, kycController.getKYCData);
router.get('/all', authenticate,authorize('admin', 'super_admin', 'kyc_officer', 'property_manager', 'financial_analyst', 'compliance_officer'),  kycController.getAllKYCData);
module.exports = router;