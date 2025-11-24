const express = require('express');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');

const router = express.Router();

const profileUpdateValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters'),
  body('phone')
    .optional()
    .matches(/^(\+966|966|0)?[5-9]\d{8}$/)
    .withMessage('Valid Saudi phone number required'),
  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Street address too long'),
  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City name too long'),
  body('preferences.language')
    .optional()
    .isIn(['en', 'ar'])
    .withMessage('Language must be en or ar'),
  body('preferences.notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification preference must be boolean'),
  body('preferences.notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notification preference must be boolean')
];

const userIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid user ID')
];

// GET /api/users/profile - Get user profile
router.get('/profile', 
  authenticate, 
  userController.getProfile
);

// PUT /api/users/profile - Update user profile
router.put('/profile',
  authenticate,
  profileUpdateValidation,
  userController.updateProfile
);

// POST /api/users/profile/complete - Save complete profile data from wizard
router.post('/profile/complete',
  authenticate,
  userController.saveCompleteProfile
);

// GET /api/users/portfolio - Get current user's portfolio
router.get('/portfolio', 
  authenticate, 
  userController.getCurrentUserPortfolio
);

// GET /api/users/:id/portfolio - Get specific user's portfolio
router.get('/:id/portfolio',
  authenticate,
  userIdValidation,
  userController.getUserPortfolio
);

// GET /api/users/portfolio/consolidated - Get current user's consolidated portfolio (grouped by property)
router.get('/portfolio/consolidated',
  authenticate,
  userController.getConsolidatedPortfolio
);

// GET /api/users/:id/portfolio/consolidated - Get specific user's consolidated portfolio (grouped by property)
router.get('/:id/portfolio/consolidated',
  authenticate,
  userIdValidation,
  userController.getConsolidatedPortfolio
);

// GET /api/users/:id/kyc-status - Get user's KYC status
router.get('/:id/kyc-status',
  authenticate,
  userIdValidation,
  userController.getKycStatus
);

module.exports = router;