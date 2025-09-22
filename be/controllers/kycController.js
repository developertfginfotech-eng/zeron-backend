const KYC = require('../models/KYC');
const User = require('../models/User');
const path = require('path');
const logger = require('../utils/logger');

class KYCController {
  async uploadDocuments(req, res, next) {
    try {
      const userId = req.user.id;
      const files = req.files;

      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      let kyc = await KYC.findOne({ user: userId });
      if (!kyc) kyc = new KYC({ user: userId });

      const baseUrl = `${req.protocol}://${req.get("host")}/uploads`;

      if (files.nationalId) {
        kyc.documents.nationalId = {
          url: `${baseUrl}/${path.basename(files.nationalId[0].path)}`,
          uploadedAt: new Date(),
        };
      }

      if (files.selfie) {
        kyc.documents.selfie = {
          url: `${baseUrl}/${path.basename(files.selfie[0].path)}`,
          uploadedAt: new Date(),
        };
      }

      if (files.proofOfIncome) {
        kyc.documents.proofOfIncome = {
          url: `${baseUrl}/${path.basename(files.proofOfIncome[0].path)}`,
          uploadedAt: new Date(),
          type: req.body.incomeDocType || 'salary_certificate'
        };
      }

      if (files.addressProof) {
        kyc.documents.addressProof = {
          url: `${baseUrl}/${path.basename(files.addressProof[0].path)}`,
          uploadedAt: new Date(),
          type: req.body.addressDocType || 'utility_bill'
        };
      }

      // Update personal info
      if (req.body.fullNameArabic) kyc.personalInfo.fullNameArabic = req.body.fullNameArabic;
      if (req.body.fullNameEnglish) kyc.personalInfo.fullNameEnglish = req.body.fullNameEnglish;
      if (req.body.dateOfBirth) kyc.personalInfo.dateOfBirth = new Date(req.body.dateOfBirth);
      if (req.body.occupation) kyc.personalInfo.occupation = req.body.occupation;
      if (req.body.monthlyIncome) kyc.personalInfo.monthlyIncome = Number(req.body.monthlyIncome);

      // Update address
      if (req.body.street) kyc.address.street = req.body.street;
      if (req.body.city) kyc.address.city = req.body.city;
      if (req.body.region) kyc.address.region = req.body.region;
      if (req.body.postalCode) kyc.address.postalCode = req.body.postalCode;

      // Check completion
      if (kyc.completionPercentage >= 100) {
        kyc.status = 'submitted';
        kyc.submittedAt = new Date();
        await User.findByIdAndUpdate(userId, { kycStatus: 'submitted' });
      }

      await kyc.save();

      logger.info(`KYC documents uploaded: User ${userId}, Files: ${Object.keys(files).join(', ')}`);

      res.status(200).json({
        success: true,
        message: 'Documents uploaded successfully',
        data: {
          kycStatus: kyc.status,
          completionPercentage: kyc.completionPercentage,
          submittedAt: kyc.submittedAt,
          uploadedDocuments: Object.keys(files)
        }
      });

    } catch (error) {
      logger.error('KYC upload error:', error);
      next(error);
    }
  }
}

module.exports = new KYCController();
 