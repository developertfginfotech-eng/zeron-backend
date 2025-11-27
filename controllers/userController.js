const User = require('../models/User');
const Investment = require('../models/Investment');
const KYC = require('../models/KYC');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class UserController {

  // Simple profile method - just basic info and KYC status
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .select('-password')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Response with profile data included
      res.json({
        success: true,
        data: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          kycStatus: user.kycStatus,
          emailVerified: user.emailVerified,
          kycUpdated: user.kycStatus === 'approved',
          canInvest: user.status === 'active' && user.kycStatus === 'approved' && user.emailVerified,
          wallet: {
            totalUnitsOwned: user.wallet?.totalUnitsOwned || 0,
            totalInvested: user.wallet?.totalInvested || 0,
            totalReturns: user.wallet?.totalReturns || 0
          },
          investmentSummary: {
            totalInvested: user.investmentSummary?.totalInvested || 0,
            totalReturns: user.investmentSummary?.totalReturns || 0,
            propertyCount: user.investmentSummary?.propertyCount || 0,
            lastInvestmentDate: user.investmentSummary?.lastInvestmentDate || null
          },
          profileData: user.profileData || null
        }
      });

    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user profile',
        error: error.message
      });
    }
  }

  // Simple update profile
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const allowedFields = [
        'firstName', 'lastName', 'phone', 'address', 'preferences',
        'dateOfBirth', 'nationality', 'profileData'
      ];

      const updateData = {};

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      updateData.updatedAt = new Date();

      const user = await User.findByIdAndUpdate(
        req.user.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          phone: user.phone,
          status: user.status,
          kycStatus: user.kycStatus,
          kycUpdated: user.kycStatus === 'approved',
          profileData: user.profileData || null
        }
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  }

  // Save complete profile data from wizard
  async saveCompleteProfile(req, res) {
    try {
      const userId = req.user.id;
      const {
        // Investment Profile
        experience,
        riskTolerance,
        investmentGoals,
        preferredTypes,
        investmentAmount,
        timeline,
        // Banking Details
        bankName,
        iban,
        accountHolder,
        swiftCode,
        accountType,
        // Communication Preferences
        emailNotifications,
        smsAlerts,
        languagePreference,
        timezone,
        marketingEmails,
        monthlyReports,
        // Employment & Portfolio
        employmentStatus,
        employer,
        jobTitle,
        monthlySalary,
        hasInvestmentPortfolio,
        portfolioValue
      } = req.body;

      // Structure the profile data
      const profileData = {
        investmentProfile: {
          experience,
          riskTolerance,
          investmentGoals,
          preferredTypes,
          investmentAmount,
          timeline,
          completed: true
        },
        bankingDetails: {
          bankName,
          iban,
          accountHolder,
          swiftCode,
          accountType,
          completed: true
        },
        communicationPreferences: {
          emailNotifications,
          smsAlerts,
          languagePreference,
          timezone,
          marketingEmails,
          monthlyReports,
          completed: true
        },
        employmentPortfolio: {
          employmentStatus,
          employer,
          jobTitle,
          monthlySalary,
          hasInvestmentPortfolio,
          portfolioValue,
          completed: true
        },
        profileCompleted: true,
        profileCompletedAt: new Date()
      };

      const user = await User.findByIdAndUpdate(
        userId,
        {
          profileData,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      logger.info(`Profile completed successfully - User: ${userId}`);

      res.json({
        success: true,
        message: 'Profile completed successfully',
        data: {
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileData: user.profileData
          }
        }
      });
    } catch (error) {
      logger.error('Save complete profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Error saving profile data',
        error: error.message
      });
    }
  }

  // Simple KYC status check
  async getCurrentKycStatus(req, res) {
    try {
      const user = await User.findById(req.user.id).select('kycStatus');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          kycStatus: user.kycStatus,
          kycUpdated: user.kycStatus === 'approved'
        }
      });

    } catch (error) {
      logger.error('Get KYC status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching KYC status',
        error: error.message
      });
    }
  }

  // Portfolio methods remain the same
  async getCurrentUserPortfolio(req, res) {
    try {
      const userId = req.user.id;
      return await this.getPortfolioData(userId, res);
    } catch (error) {
      logger.error('Get current user portfolio error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching portfolio',
        error: error.message
      });
    }
  }

  async getUserPortfolio(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { id } = req.params;

      if (req.user.id !== id && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      return await this.getPortfolioData(id, res);
    } catch (error) {
      logger.error('Get user portfolio error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching portfolio',
        error: error.message
      });
    }
  }

  async getPortfolioData(userId, res) {
    try {
      const { calculateInvestmentReturns } = require('../utils/calculate-investment-returns');

      const investments = await Investment.find({
        user: userId,
        status: 'confirmed'
      })
      .populate('property', 'title titleAr location financials images status')
      .lean();

      // ==================== CALCULATE REAL-TIME RETURNS ====================
      // Calculate unrealized returns for each active investment
      let totalUnrealizedReturns = 0;
      let totalCurrentValue = 0;
      let totalInvested = 0;

      investments.forEach(investment => {
        const returns = calculateInvestmentReturns(investment);
        totalCurrentValue += returns.currentValue;
        totalInvested += returns.principalAmount;
        totalUnrealizedReturns += returns.totalReturns;
      });

      // Get realized returns from wallet (already withdrawn)
      const user = await User.findById(userId);
      const realizedReturns = user?.wallet?.totalReturns || 0;

      // Total returns = unrealized (current investments) + realized (withdrawn)
      const totalReturns = totalUnrealizedReturns + realizedReturns;
      // ==================== END REAL-TIME CALCULATION ====================

      const portfolioSummary = await Investment.getUserPortfolioSummary(userId);

      const summary = {
        totalInvestments: totalInvested,
        totalCurrentValue: totalCurrentValue,
        totalReturns: totalReturns,
        propertyCount: investments.length,
        unrealizedGains: totalUnrealizedReturns,
        realizedGains: realizedReturns
      };

      // Calculate total shares across all investments
      const totalShares = investments.reduce((total, inv) => total + inv.shares, 0);

      const totalProfitLoss = summary.totalCurrentValue - summary.totalInvestments;
      const totalReturn = summary.totalReturns + totalProfitLoss;
      const totalReturnPercentage = summary.totalInvestments > 0
        ? (totalReturn / summary.totalInvestments) * 100
        : 0;

      // Calculate percentage changes for dashboard
      const portfolioGrowthPercentage = summary.totalInvestments > 0
        ? ((summary.totalCurrentValue - summary.totalInvestments) / summary.totalInvestments) * 100
        : 0;

      const totalReturnsPercentage = summary.totalInvestments > 0
        ? (summary.totalReturns / summary.totalInvestments) * 100
        : 0;

      const monthlyPerformance = await Investment.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            status: 'confirmed',
            createdAt: {
              $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalInvested: { $sum: '$amount' },
            totalShares: { $sum: '$shares' },
            totalReturns: { $sum: '$returns.totalReturnsReceived' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const portfolioDetails = investments.map(investment => {
        const currentValue = investment.shares * investment.property.financials.pricePerShare;
        const profitLoss = currentValue - investment.amount;
        const profitLossPercentage = (profitLoss / investment.amount) * 100;

        return {
          investmentId: investment._id,
          property: {
            id: investment.property._id,
            title: investment.property.title,
            titleAr: investment.property.titleAr,
            location: investment.property.location,
            image: investment.property.images?.[0]?.url,
            status: investment.property.status
          },
          investment: {
            shares: investment.shares,
            originalAmount: investment.amount,
            currentValue: currentValue,
            profitLoss: profitLoss,
            profitLossPercentage: profitLossPercentage,
            totalReturnsReceived: investment.returns.totalReturnsReceived,
            lastReturnDate: investment.returns.lastReturnDate,
            investmentDate: investment.createdAt
          }
        };
      });

      res.json({
        success: true,
        data: {
          summary: {
            ...summary,
            totalShares,
            totalAmountSpent: summary.totalInvestments,
            totalProfitLoss,
            totalReturn,
            totalReturnPercentage,
            portfolioGrowthPercentage: parseFloat(portfolioGrowthPercentage.toFixed(2)),
            totalReturnsPercentage: parseFloat(totalReturnsPercentage.toFixed(2)),
            averageReturn: summary.propertyCount > 0 ? totalReturn / summary.propertyCount : 0
          },
          investments: portfolioDetails,
          performance: {
            monthly: monthlyPerformance
          },
          metadata: {
            lastUpdated: new Date(),
            totalProperties: summary.propertyCount,
            activeInvestments: investments.filter(inv => inv.property.status === 'active').length
          }
        }
      });
    } catch (error) {
      logger.error('Get portfolio data error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching portfolio data',
        error: error.message
      });
    }
  }

  // NEW: Get consolidated portfolio - groups multiple purchases of same property
  async getConsolidatedPortfolio(req, res) {
    try {
      const { calculateInvestmentReturns } = require('../utils/calculate-investment-returns');
      const userId = req.params.id || req.user.id;

      const investments = await Investment.find({
        user: userId,
        status: 'confirmed'
      })
      .populate('property', 'title titleAr location financials images status propertyType investmentTerms')
      .lean();

      // Group investments by property ID
      const groupedByProperty = {};

      investments.forEach(investment => {
        const propertyId = investment.property._id.toString();

        if (!groupedByProperty[propertyId]) {
          groupedByProperty[propertyId] = {
            property: investment.property,
            investments: [],
            totalUnits: 0,
            totalInvested: 0,
            totalCurrentValue: 0,
            totalReturns: 0
          };
        }

        // Calculate returns for this specific investment
        const returns = calculateInvestmentReturns(investment);

        groupedByProperty[propertyId].investments.push({
          investmentId: investment._id,
          units: investment.shares,
          amount: investment.amount,
          currentValue: returns.currentValue,
          returns: returns.totalReturns,
          rate: investment.amount > 0 ? ((returns.totalReturns / investment.amount) * 100).toFixed(2) : 0,
          investedOn: investment.createdAt,
          maturesOn: investment.maturityDate
        });

        groupedByProperty[propertyId].totalUnits += investment.shares;
        groupedByProperty[propertyId].totalInvested += investment.amount;
        groupedByProperty[propertyId].totalCurrentValue += returns.currentValue;
        groupedByProperty[propertyId].totalReturns += returns.totalReturns;
      });

      // Convert grouped object to array and calculate consolidated metrics
      const consolidatedInvestments = Object.values(groupedByProperty).map(group => {
        const rate = group.totalInvested > 0
          ? ((group.totalReturns / group.totalInvested) * 100).toFixed(2)
          : 0;

        return {
          property: {
            id: group.property._id,
            title: group.property.title,
            titleAr: group.property.titleAr,
            location: group.property.location,
            image: group.property.images?.[0]?.url,
            status: group.property.status,
            propertyType: group.property.propertyType
          },
          consolidated: {
            totalUnits: group.totalUnits,
            totalInvested: group.totalInvested,
            totalCurrentValue: parseFloat(group.totalCurrentValue.toFixed(2)),
            totalReturns: parseFloat(group.totalReturns.toFixed(2)),
            rate: parseFloat(rate),
            numberOfPurchases: group.investments.length,
            firstInvestment: group.investments[0]?.investedOn,
            latestInvestment: group.investments[group.investments.length - 1]?.investedOn
          },
          purchases: group.investments // Individual purchase details
        };
      });

      // Calculate overall summary
      const summary = {
        totalProperties: consolidatedInvestments.length,
        totalInvested: consolidatedInvestments.reduce((sum, inv) => sum + inv.consolidated.totalInvested, 0),
        totalCurrentValue: consolidatedInvestments.reduce((sum, inv) => sum + inv.consolidated.totalCurrentValue, 0),
        totalReturns: consolidatedInvestments.reduce((sum, inv) => sum + inv.consolidated.totalReturns, 0),
        totalUnits: consolidatedInvestments.reduce((sum, inv) => sum + inv.consolidated.totalUnits, 0)
      };

      summary.overallRate = summary.totalInvested > 0
        ? ((summary.totalReturns / summary.totalInvested) * 100).toFixed(2)
        : 0;

      res.json({
        success: true,
        data: {
          summary,
          investments: consolidatedInvestments
        }
      });
    } catch (error) {
      logger.error('Get consolidated portfolio error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching consolidated portfolio',
        error: error.message
      });
    }
  }

  async getKycStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      
      if (req.user.id !== id && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const kyc = await KYC.findOne({ user: id });
      
      res.status(200).json({
        success: true,
        data: {
          kycStatus: user.kycStatus,
          kycUpdated: user.kycStatus === 'approved',
          completionPercentage: kyc ? kyc.completionPercentage : 0,
          submittedAt: kyc?.submittedAt || null,
          reviewedAt: kyc?.reviewedAt || null,
          rejectionReasons: kyc?.rejectionReasons || []
        }
      });

    } catch (error) {
      logger.error('Get KYC status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching KYC status',
        error: error.message
      });
    }
  }
}

const userController = new UserController();

module.exports = {
  getProfile: userController.getProfile.bind(userController),
  updateProfile: userController.updateProfile.bind(userController),
  saveCompleteProfile: userController.saveCompleteProfile.bind(userController),
  getCurrentKycStatus: userController.getCurrentKycStatus.bind(userController),
  getCurrentUserPortfolio: userController.getCurrentUserPortfolio.bind(userController),
  getUserPortfolio: userController.getUserPortfolio.bind(userController),
  getConsolidatedPortfolio: userController.getConsolidatedPortfolio.bind(userController),
  getKycStatus: userController.getKycStatus.bind(userController)
};