const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class WalletController {

  /**
   * Get wallet balance for authenticated user
   * GET /api/wallet/balance
   */
  async getWalletBalance(req, res) {
    try {
      const user = await User.findById(req.user.id).select('wallet');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get transaction summary
      const balanceSummary = await Transaction.getUserBalance(req.user.id);

      // Calculate current balance
      const currentBalance = (balanceSummary.totalDeposits || 0) -
                           (balanceSummary.totalWithdrawals || 0) -
                           (balanceSummary.totalInvestments || 0) +
                           (balanceSummary.totalPayouts || 0);

      res.json({
        success: true,
        data: {
          availableBalance: Math.max(currentBalance, 0),
          totalDeposits: balanceSummary.totalDeposits || 0,
          totalWithdrawals: balanceSummary.totalWithdrawals || 0,
          totalInvested: balanceSummary.totalInvestments || 0,
          totalPayouts: balanceSummary.totalPayouts || 0,
          pendingAmount: 0,
          currency: 'SAR'
        }
      });

    } catch (error) {
      logger.error('Get wallet balance error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching wallet balance',
        error: error.message
      });
    }
  }

  /**
   * Get wallet transactions for authenticated user
   * GET /api/wallet/transactions
   */
  async getWalletTransactions(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const skip = parseInt(req.query.skip) || 0;
      const type = req.query.type; // Optional filter

      let query = { user: req.user.id };
      if (type) {
        query.type = type;
      }

      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const total = await Transaction.countDocuments(query);

      res.json({
        success: true,
        data: transactions.map(t => ({
          id: t._id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          date: t.createdAt.toISOString().split('T')[0],
          status: t.status,
          transactionId: t.transactionId
        })),
        pagination: {
          total,
          limit,
          skip,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      logger.error('Get wallet transactions error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching transactions',
        error: error.message
      });
    }
  }

  /**
   * Recharge wallet (add funds)
   * POST /api/wallet/recharge
   */
  async rechargeWallet(req, res) {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { amount, method, description } = req.body;

      // Validate amount
      if (amount < 1000) {
        return res.status(400).json({
          success: false,
          message: 'Minimum recharge amount is SAR 1,000'
        });
      }

      if (amount > 1000000) {
        return res.status(400).json({
          success: false,
          message: 'Maximum recharge amount is SAR 1,000,000'
        });
      }

      // Get current balance before transaction
      const balanceSummary = await Transaction.getUserBalance(req.user.id);
      const balanceBefore = (balanceSummary.totalDeposits || 0) -
                           (balanceSummary.totalWithdrawals || 0) -
                           (balanceSummary.totalInvestments || 0) +
                           (balanceSummary.totalPayouts || 0);

      // Create transaction
      const transaction = new Transaction({
        user: req.user.id,
        type: 'deposit',
        amount: amount,
        description: description || `Wallet recharge via ${method || 'bank transfer'}`,
        status: 'completed',
        paymentMethod: method || 'bank_transfer',
        balanceBefore: Math.max(balanceBefore, 0),
        balanceAfter: Math.max(balanceBefore, 0) + amount
      });

      await transaction.save();

      // Update user wallet balance
      const user = await User.findById(req.user.id);
      user.wallet.balance = Math.max(balanceBefore, 0) + amount;
      await user.save();

      logger.info(`Wallet recharged for user ${req.user.id}: SAR ${amount}`);

      res.json({
        success: true,
        data: {
          transactionId: transaction.transactionId,
          amount: amount,
          status: 'completed',
          message: 'Wallet recharged successfully',
          newBalance: user.wallet.balance
        }
      });

    } catch (error) {
      logger.error('Recharge wallet error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing wallet recharge',
        error: error.message
      });
    }
  }

  /**
   * Withdraw from wallet
   * POST /api/wallet/withdraw
   */
  async withdrawFromWallet(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { amount, accountDetails, description, propertyId } = req.body;

      // Validate amount
      if (amount < 1000) {
        return res.status(400).json({
          success: false,
          message: 'Minimum withdrawal amount is SAR 1,000'
        });
      }

      // Get user
      const user = await User.findById(req.user.id).populate('groups');

      // Get current balance
      const balanceSummary = await Transaction.getUserBalance(req.user.id);
      const currentBalance = (balanceSummary.totalDeposits || 0) -
                            (balanceSummary.totalWithdrawals || 0) -
                            (balanceSummary.totalInvestments || 0) +
                            (balanceSummary.totalPayouts || 0);

      if (currentBalance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance'
        });
      }

      // Create withdrawal request (PENDING - requires admin approval)
      const WithdrawalRequest = require('../models/WithdrawalRequest');
      const withdrawalRequest = new WithdrawalRequest({
        userId: req.user.id,
        propertyId: propertyId,
        amount: amount,
        principalAmount: amount, // Can be updated if we track principal vs earnings
        reason: description || 'Property investment withdrawal',
        status: 'pending',
        groupId: user.groups && user.groups.length > 0 ? user.groups[0]._id : null,
        bankAccount: accountDetails
      });

      await withdrawalRequest.save();

      logger.info(`Withdrawal request created for user ${req.user.id}: SAR ${amount} - Status: PENDING`);

      res.json({
        success: true,
        data: {
          withdrawalId: withdrawalRequest._id,
          amount: amount,
          status: 'pending',
          message: 'Withdrawal request submitted. Awaiting admin approval.',
          requestedAt: withdrawalRequest.requestedAt
        }
      });

    } catch (error) {
      logger.error('Withdraw from wallet error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing withdrawal',
        error: error.message
      });
    }
  }

  /**
   * Record investment transaction (called from investment controller)
   */
  async recordInvestmentTransaction(userId, amount, propertyId, description) {
    try {
      const balanceSummary = await Transaction.getUserBalance(userId);
      const balanceBefore = (balanceSummary.totalDeposits || 0) -
                           (balanceSummary.totalWithdrawals || 0) -
                           (balanceSummary.totalInvestments || 0) +
                           (balanceSummary.totalPayouts || 0);

      const transaction = new Transaction({
        user: userId,
        type: 'investment',
        amount: amount,
        description: description || 'Property investment',
        status: 'completed',
        paymentMethod: 'wallet',
        relatedEntity: 'property',
        relatedEntityId: propertyId,
        balanceBefore: Math.max(balanceBefore, 0),
        balanceAfter: Math.max(balanceBefore - amount, 0)
      });

      await transaction.save();

      // Update user wallet
      const user = await User.findById(userId);
      user.wallet.balance = Math.max(balanceBefore - amount, 0);
      user.wallet.totalInvested = (user.wallet.totalInvested || 0) + amount;
      await user.save();

      return transaction;
    } catch (error) {
      logger.error('Record investment transaction error:', error);
      throw error;
    }
  }

  /**
   * Record payout transaction (investment returns)
   */
  async recordPayoutTransaction(userId, amount, propertyId, description) {
    try {
      const balanceSummary = await Transaction.getUserBalance(userId);
      const balanceBefore = (balanceSummary.totalDeposits || 0) -
                           (balanceSummary.totalWithdrawals || 0) -
                           (balanceSummary.totalInvestments || 0) +
                           (balanceSummary.totalPayouts || 0);

      const transaction = new Transaction({
        user: userId,
        type: 'payout',
        amount: amount,
        description: description || 'Investment returns',
        status: 'completed',
        paymentMethod: 'wallet',
        relatedEntity: 'property',
        relatedEntityId: propertyId,
        balanceBefore: Math.max(balanceBefore, 0),
        balanceAfter: Math.max(balanceBefore, 0) + amount
      });

      await transaction.save();

      // Update user wallet
      const user = await User.findById(userId);
      user.wallet.balance = Math.max(balanceBefore, 0) + amount;
      user.wallet.totalReturns = (user.wallet.totalReturns || 0) + amount;
      await user.save();

      return transaction;
    } catch (error) {
      logger.error('Record payout transaction error:', error);
      throw error;
    }
  }
}

module.exports = new WalletController();
