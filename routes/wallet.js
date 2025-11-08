const express = require('express');
const walletController = require('../controllers/walletController');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');

const router = express.Router();

// Validation middleware
const rechargeValidation = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom(value => {
      if (value < 1000) throw new Error('Minimum recharge amount is SAR 1,000');
      if (value > 1000000) throw new Error('Maximum recharge amount is SAR 1,000,000');
      return true;
    }),
  body('method')
    .optional()
    .isIn(['bank_transfer', 'card', 'other'])
    .withMessage('Invalid payment method'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description too long')
];

const withdrawValidation = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom(value => {
      if (value < 1000) throw new Error('Minimum withdrawal amount is SAR 1,000');
      if (value > 1000000) throw new Error('Maximum withdrawal amount is SAR 1,000,000');
      return true;
    }),
  body('accountDetails')
    .optional()
    .isObject()
    .withMessage('Account details must be an object'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description too long')
];

// Routes

/**
 * GET /api/wallet/balance
 * Get current wallet balance for authenticated user
 */
router.get('/balance',
  authenticate,
  walletController.getWalletBalance
);

/**
 * GET /api/wallet/transactions
 * Get wallet transaction history for authenticated user
 * Query params: limit, skip, type
 */
router.get('/transactions',
  authenticate,
  walletController.getWalletTransactions
);

/**
 * POST /api/wallet/recharge
 * Recharge wallet (add funds)
 * Body: { amount, method, description }
 */
router.post('/recharge',
  authenticate,
  rechargeValidation,
  walletController.rechargeWallet
);

/**
 * POST /api/wallet/withdraw
 * Withdraw funds from wallet
 * Body: { amount, accountDetails, description }
 */
router.post('/withdraw',
  authenticate,
  withdrawValidation,
  walletController.withdrawFromWallet
);

module.exports = router;