const express = require('express');
const kycController = require('../controllers/kycController');
const { authenticate } = require('../middleware/auth');
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

module.exports = router;