const KYC = require('../models/KYC');
const User = require('../models/User');
const path = require('path');
const logger = require('../utils/logger');

class KYCController {
  // Add completion percentage calculation method
  calculateCompletionPercentage(kyc) {
    let completed = 0;
    const totalSteps = 4;
    
    if (kyc.documents?.nationalId?.url) completed++;
    if (kyc.documents?.selfie?.url) completed++;
    if (kyc.documents?.proofOfIncome?.url) completed++;
    if (kyc.documents?.addressProof?.url) completed++;
    
    return Math.round((completed / totalSteps) * 100);
  }

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
      if (!kyc) {
        kyc = new KYC({ 
          user: userId,
          personalInfo: {},
          address: {},
          documents: {}
        });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}/uploads`;

      // Use filename instead of path for your upload middleware
      if (files.nationalId) {
        kyc.documents.nationalId = {
          url: `${baseUrl}/${files.nationalId[0].filename}`,
          uploadedAt: new Date(),
        };
      }

      if (files.selfie) {
        kyc.documents.selfie = {
          url: `${baseUrl}/${files.selfie[0].filename}`,
          uploadedAt: new Date(),
        };
      }

      if (files.proofOfIncome) {
        kyc.documents.proofOfIncome = {
          url: `${baseUrl}/${files.proofOfIncome[0].filename}`,
          uploadedAt: new Date(),
          type: req.body.incomeDocType || 'salary_certificate'
        };
      }

      if (files.addressProof) {
        kyc.documents.addressProof = {
          url: `${baseUrl}/${files.addressProof[0].filename}`,
          uploadedAt: new Date(),
          type: req.body.addressDocType || 'utility_bill'
        };
      }

      if (req.body.fullNameArabic) kyc.personalInfo.fullNameArabic = req.body.fullNameArabic;
      if (req.body.fullNameEnglish) kyc.personalInfo.fullNameEnglish = req.body.fullNameEnglish;
      if (req.body.dateOfBirth) kyc.personalInfo.dateOfBirth = new Date(req.body.dateOfBirth);
      if (req.body.occupation) kyc.personalInfo.occupation = req.body.occupation;
      if (req.body.monthlyIncome) kyc.personalInfo.monthlyIncome = Number(req.body.monthlyIncome);

      if (req.body.street) kyc.address.street = req.body.street;
      if (req.body.city) kyc.address.city = req.body.city;
      if (req.body.region) kyc.address.region = req.body.region;
      if (req.body.postalCode) kyc.address.postalCode = req.body.postalCode;

      // Calculate completion percentage using the method
      const completionPercentage = this.calculateCompletionPercentage(kyc);

      if (completionPercentage >= 75) {
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
          completionPercentage: completionPercentage,
          submittedAt: kyc.submittedAt,
          uploadedDocuments: Object.keys(files)
        }
      });

    } catch (error) {
      logger.error('KYC upload error:', error);
      next(error);
    }
  }

  async getKYCData(req, res, next) {
    try {
      const userId = req.user.id;
      const kyc = await KYC.findOne({ user: userId }).lean();

      if (!kyc) {
        return res.status(404).json({ 
          success: false, 
          message: 'KYC data not found' 
        });
      }

      // Add completion percentage to response
      const completionPercentage = this.calculateCompletionPercentage(kyc);

      res.status(200).json({
        success: true,
        data: {
          ...kyc,
          completionPercentage
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllKYCData(req, res, next) {
    try {
      const allKYC = await KYC.find()
        .populate('user', 'email fullNameArabic fullNameEnglish kycStatus occupation')
        .lean();

      // Add completion percentages
      const kycWithCompletion = allKYC.map(kyc => ({
        ...kyc,
        completionPercentage: this.calculateCompletionPercentage(kyc)
      }));

      const totalApplicants = allKYC.length;
      const approved = allKYC.filter(k => k.status === 'approved').length;
      const pending = allKYC.filter(k => k.status === 'pending' || k.status === 'under_review' || k.status === 'submitted').length;
      const rejected = allKYC.filter(k => k.status === 'rejected').length;

      res.status(200).json({
        success: true,
        data: kycWithCompletion,
        stats: { totalApplicants, approved, pending, rejected }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new KYCController();