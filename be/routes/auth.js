const express = require('express');
const authController = require('../controllers/authController');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const upload = multer();
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later.'
  }
});

const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),
  body('phone')
    .matches(/^(\+966|966|0)?[5-9]\d{8}$/)
    .withMessage('Valid Saudi phone number required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];


router.post('/register',upload.none(), registerLimiter, registerValidation, authController.register);
router.post('/login', upload.none(), authLimiter, loginValidation, authController.login);

module.exports = router;