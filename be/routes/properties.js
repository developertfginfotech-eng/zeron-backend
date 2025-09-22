const express = require('express');
const propertyController = require('../controllers/propertyController');
const { authenticate } = require('../middleware/auth');
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const investmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many investment attempts, please try again later.'
  }
});

const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: 'Too many search requests, please try again later.'
  }
});

const investmentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid property ID'),
  body('shares')
    .isInt({ min: 1 })
    .withMessage('Shares must be at least 1'),
  body('amount')
    .isFloat({ min: 1000 })
    .withMessage('Investment amount must be at least 1,000 SAR'),
  body('paymentMethod')
    .optional()
    .isIn(['mada', 'visa', 'mastercard', 'apple_pay', 'samsung_pay'])
    .withMessage('Invalid payment method')
];

const propertyQueryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('minInvestment')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum investment must be a positive number'),
  query('maxInvestment')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum investment must be a positive number'),
  query('minYield')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Minimum yield must be between 0 and 100'),
  query('city')
    .optional()
    .isIn(['riyadh', 'jeddah', 'dammam', 'khobar', 'mecca', 'medina'])
    .withMessage('Invalid city'),
  query('propertyType')
    .optional()
    .isIn(['residential', 'commercial', 'retail'])
    .withMessage('Invalid property type')
];

// GET /api/properties - List properties with filters
router.get('/', 
  propertyQueryValidation, 
  authenticate, 
  propertyController.getAllProperties
);

// GET /api/properties/search - Search properties
router.get('/search', 
  searchLimiter,
  propertyQueryValidation,
  propertyController.searchProperties
);

// GET /api/properties/:id - Get property details
router.get('/:id', 
  authenticate, 
  param('id').isMongoId().withMessage('Invalid property ID'),
  propertyController.getPropertyById
);

// POST /api/properties/:id/invest - Invest in property
router.post('/:id/invest', 
  authenticate,
  investmentLimiter,
  investmentValidation,
  propertyController.investInProperty
);

module.exports = router;