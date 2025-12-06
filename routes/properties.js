const express = require('express');
const propertyController = require('../controllers/propertyController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiters
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

// Validation rules
const investmentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid property ID'),
  body('units')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Units must be at least 1'),
  body('shares')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Shares must be at least 1'),
  body('paymentMethod')
    .optional()
    .isIn(['mada', 'visa', 'mastercard', 'apple_pay', 'samsung_pay', 'fake'])
    .withMessage('Invalid payment method'),
  // Custom validation to ensure either units or shares is provided
  body().custom((value, { req }) => {
    if (!req.body.units && !req.body.shares) {
      throw new Error('Units or shares must be provided');
    }
    return true;
  })
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

// Routes
// GET /api/properties - Get all properties
router.get('/', 
  propertyQueryValidation,
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

// PATCH /api/properties/:id/deactivate - Deactivate property (requires properties edit permission)
router.patch('/:id/deactivate',
  authenticate,
  (req, res, next) => {
    if (req.user?.role === 'super_admin') {
      return next();
    }
    return checkPermission('properties', 'edit')(req, res, next);
  },
  param('id').isMongoId().withMessage('Invalid property ID'),
  body('reason').optional().trim(),
  body('comment').optional().trim(),
  propertyController.deactivateProperty
);

// PATCH /api/properties/:id/activate - Reactivate property (requires properties edit permission)
router.patch('/:id/activate',
  authenticate,
  (req, res, next) => {
    if (req.user?.role === 'super_admin') {
      return next();
    }
    return checkPermission('properties', 'edit')(req, res, next);
  },
  param('id').isMongoId().withMessage('Invalid property ID'),
  propertyController.activateProperty
);

module.exports = router;