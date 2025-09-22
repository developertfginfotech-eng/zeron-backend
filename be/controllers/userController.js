const User = require('../models/User');
const Investment = require('../models/Investment');
const KYC = require('../models/KYC');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class UserController {

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

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching user profile',
        error: error.message
      });
    }
  }

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

      const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'preferences'];
      const updateData = {};
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

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
        data: user
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  }

  async getCurrentUserPortfolio(req, res) {
    try {
      const userId = req.user.id;
      return this.getPortfolioData(userId, res);
    } catch (error) {
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
      
      // Users can only view their own portfolio, unless they're admin
      if (req.user.id !== id && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      return this.getPortfolioData(id, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching portfolio',
        error: error.message
      });
    }
  }

  async getPortfolioData(userId, res) {
    // Get user's investments
    const investments = await Investment.find({ 
      user: userId, 
      status: 'confirmed' 
    })
    .populate('property', 'title titleAr location financials images status')
    .lean();

    // Calculate portfolio summary
    const portfolioSummary = await Investment.getUserPortfolioSummary(userId);
    
    const summary = portfolioSummary[0] || {
      totalInvestments: 0,
      totalCurrentValue: 0,
      totalReturns: 0,
      propertyCount: 0
    };

    // Calculate additional metrics
    const totalProfitLoss = summary.totalCurrentValue - summary.totalInvestments;
    const totalReturn = summary.totalReturns + totalProfitLoss;
    const totalReturnPercentage = summary.totalInvestments > 0 
      ? (totalReturn / summary.totalInvestments) * 100 
      : 0;

    // Get monthly performance (last 12 months)
    const monthlyPerformance = await Investment.aggregate([
      {
        $match: { 
          user: mongoose.Types.ObjectId(userId),
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
          totalReturns: { $sum: '$returns.totalReturnsReceived' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Transform investments data
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
          totalProfitLoss,
          totalReturn,
          totalReturnPercentage,
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

module.exports = new UserController();