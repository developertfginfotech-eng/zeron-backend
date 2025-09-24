const KYC = require('../models/KYC');
const User = require('../models/User');
const path = require('path');
const logger = require('../utils/logger');

class KYCController {
  async uploadDocuments(req, res, next) {
    try {
      const userId = req.user.id;
      const files = req.files;

      console.log('KYC Upload Request:', {
        userId,
        files: files ? Object.keys(files) : 'No files',
        body: req.body
      });

      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one document is required'
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

      // Process uploaded files - handle both single files and arrays
      if (files.nationalId) {
        const file = Array.isArray(files.nationalId) ? files.nationalId[0] : files.nationalId;
        kyc.documents.nationalId = {
          url: `${baseUrl}/${file.filename}`,
          uploadedAt: new Date(),
        };
      }

      if (files.selfie) {
        const file = Array.isArray(files.selfie) ? files.selfie[0] : files.selfie;
        kyc.documents.selfie = {
          url: `${baseUrl}/${file.filename}`,
          uploadedAt: new Date(),
        };
      }

      if (files.proofOfIncome) {
        const file = Array.isArray(files.proofOfIncome) ? files.proofOfIncome[0] : files.proofOfIncome;
        kyc.documents.proofOfIncome = {
          url: `${baseUrl}/${file.filename}`,
          uploadedAt: new Date(),
          type: req.body.incomeDocType || 'salary_certificate'
        };
      }

      if (files.addressProof) {
        const file = Array.isArray(files.addressProof) ? files.addressProof[0] : files.addressProof;
        kyc.documents.addressProof = {
          url: `${baseUrl}/${file.filename}`,
          uploadedAt: new Date(),
          type: req.body.addressDocType || 'utility_bill'
        };
      }

      // Update personal information
      if (req.body.fullNameArabic) kyc.personalInfo.fullNameArabic = req.body.fullNameArabic;
      if (req.body.fullNameEnglish) kyc.personalInfo.fullNameEnglish = req.body.fullNameEnglish;
      if (req.body.dateOfBirth) kyc.personalInfo.dateOfBirth = new Date(req.body.dateOfBirth);
      if (req.body.occupation) kyc.personalInfo.occupation = req.body.occupation;
      if (req.body.monthlyIncome) kyc.personalInfo.monthlyIncome = Number(req.body.monthlyIncome);
      if (req.body.nationality) kyc.personalInfo.nationality = req.body.nationality;

      // Update address information
      if (req.body.street) kyc.address.street = req.body.street;
      if (req.body.city) kyc.address.city = req.body.city;
      if (req.body.region) kyc.address.region = req.body.region;
      if (req.body.postalCode) kyc.address.postalCode = req.body.postalCode;

      // Update document info if provided
      if (req.body.documentType) {
        if (!kyc.documentInfo) kyc.documentInfo = {};
        kyc.documentInfo.type = req.body.documentType;
      }
      if (req.body.documentNumber) {
        if (!kyc.documentInfo) kyc.documentInfo = {};
        kyc.documentInfo.number = req.body.documentNumber;
      }

      // Calculate completion percentage inline (fixed the 'this' context issue)
      let completed = 0;
      const totalSteps = 4;
      
      if (kyc.documents?.nationalId?.url) completed++;
      if (kyc.documents?.selfie?.url) completed++;
      if (kyc.documents?.proofOfIncome?.url) completed++;
      if (kyc.documents?.addressProof?.url) completed++;
      
      const completionPercentage = Math.round((completed / totalSteps) * 100);

      // Auto-submit if completion is high enough
      if (completionPercentage >= 75 && kyc.status === 'pending') {
        kyc.status = 'submitted';
        kyc.submittedAt = new Date();
        await User.findByIdAndUpdate(userId, { kycStatus: 'submitted' });
      }

      await kyc.save();

      logger.info(`KYC documents uploaded successfully: User ${userId}, Files: ${Object.keys(files).join(', ')}, Completion: ${completionPercentage}%`);

      res.status(200).json({
        success: true,
        message: kyc.status === 'submitted' 
          ? 'KYC verification submitted successfully! Your documents are under review.'
          : 'Documents uploaded successfully. Please complete remaining fields.',
        data: {
          kycId: kyc._id,
          kycStatus: kyc.status,
          completionPercentage: completionPercentage,
          submittedAt: kyc.submittedAt,
          uploadedDocuments: Object.keys(files),
          totalFiles: Object.keys(files).length
        }
      });

    } catch (error) {
      logger.error('KYC upload error:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        files: req.files ? Object.keys(req.files) : []
      });
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
          message: 'KYC data not found',
          data: {
            status: 'pending',
            completionPercentage: 0
          }
        });
      }

      // Calculate completion percentage inline
      let completed = 0;
      const totalSteps = 4;
      
      if (kyc.documents?.nationalId?.url) completed++;
      if (kyc.documents?.selfie?.url) completed++;
      if (kyc.documents?.proofOfIncome?.url) completed++;
      if (kyc.documents?.addressProof?.url) completed++;
      
      const completionPercentage = Math.round((completed / totalSteps) * 100);

      // Sanitize document URLs for security
      const sanitizedDocuments = {};
      if (kyc.documents) {
        Object.keys(kyc.documents).forEach(key => {
          if (kyc.documents[key] && kyc.documents[key].url) {
            sanitizedDocuments[key] = {
              uploaded: true,
              uploadedAt: kyc.documents[key].uploadedAt,
              type: kyc.documents[key].type
            };
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          ...kyc,
          documents: sanitizedDocuments,
          completionPercentage
        }
      });
    } catch (error) {
      logger.error('Get KYC data error:', error);
      next(error);
    }
  }

  async getAllKYCData(req, res, next) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      
      // Build filter
      const filter = {};
      if (status && status !== 'all') {
        filter.status = status;
      }

      const allKYC = await KYC.find(filter)
        .populate('user', 'email fullNameArabic fullNameEnglish kycStatus occupation')
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean();

      // Add completion percentages
      const kycWithCompletion = allKYC.map(kyc => {
        // Calculate completion percentage inline
        let completed = 0;
        const totalSteps = 4;
        
        if (kyc.documents?.nationalId?.url) completed++;
        if (kyc.documents?.selfie?.url) completed++;
        if (kyc.documents?.proofOfIncome?.url) completed++;
        if (kyc.documents?.addressProof?.url) completed++;
        
        const completionPercentage = Math.round((completed / totalSteps) * 100);

        return {
          ...kyc,
          completionPercentage
        };
      });

      // Get total count for pagination
      const totalCount = await KYC.countDocuments(filter);

      // Calculate statistics
      const statsAggregation = await KYC.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const stats = statsAggregation.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});

      const totalApplicants = Object.values(stats).reduce((sum, count) => sum + count, 0);
      const approved = stats.approved || 0;
      const pending = (stats.pending || 0) + (stats.under_review || 0) + (stats.submitted || 0);
      const rejected = stats.rejected || 0;

      res.status(200).json({
        success: true,
        data: kycWithCompletion,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit))
        },
        stats: { totalApplicants, approved, pending, rejected }
      });
    } catch (error) {
      logger.error('Get all KYC data error:', error);
      next(error);
    }
  }

  // Admin method to update KYC status
  async updateKYCStatus(req, res, next) {
    try {
      const { kycId } = req.params;
      const { status, rejectionReason, reviewNotes } = req.body;
      const reviewedBy = req.user.id;

      const validStatuses = ['approved', 'rejected', 'under_review', 'pending'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const kyc = await KYC.findById(kycId);
      if (!kyc) {
        return res.status(404).json({
          success: false,
          message: 'KYC record not found'
        });
      }

      // Update KYC record
      kyc.status = status;
      kyc.reviewedBy = reviewedBy;
      kyc.reviewedAt = new Date();
      
      if (rejectionReason) kyc.rejectionReasons = [rejectionReason];
      if (reviewNotes) kyc.reviewNotes = reviewNotes;

      // Update user's KYC status
      await User.findByIdAndUpdate(kyc.user, {
        kycStatus: status,
        kycReviewedAt: new Date()
      });

      await kyc.save();

      logger.info(`KYC status updated: ${kycId} -> ${status} by admin ${reviewedBy}`);

      res.json({
        success: true,
        message: `KYC status updated to ${status}`,
        data: {
          kycId: kyc._id,
          status: kyc.status,
          reviewedAt: kyc.reviewedAt
        }
      });

    } catch (error) {
      logger.error('Update KYC status error:', error);
      next(error);
    }
  }
}

module.exports = new KYCController();