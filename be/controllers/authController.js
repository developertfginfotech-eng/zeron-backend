const User = require("../models/User");
const KYC = require("../models/KYC");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const logger = require("../utils/logger");

// Token generator (kept inside the same file)
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
}

class AuthController {
  // Register new user
  async register(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email, phone, password, firstName, lastName, preferredLanguage } =
        req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { phone }],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email or phone already registered",
        });
      }

      // Create user
      const user = new User({
        email,
        phone,
        password,
        firstName,
        lastName,
        preferredLanguage: preferredLanguage || "ar",
      });

      await user.save();

      // Create KYC record
      const kyc = new KYC({ user: user._id });
      await kyc.save();

      // Generate token
      const token = generateToken(user._id);

      logger.info(`New user registered: ${email}`);

      res.status(201).json({
        success: true,
        message: "Registration successful",
        data: {
          user: {
            id: user._id,
            email: user.email,
            phone: user.phone,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            kycStatus: user.kycStatus,
          },
          token,
          expiresIn: process.env.JWT_EXPIRE,
        },
      });
    } catch (error) {
      logger.error("Registration error:", error);
      next(error);
    }
  }

  // Login user
  async login(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;

      // Find user with password
      const user = await User.findOne({ email }).select("+password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: "Account temporarily locked due to too many failed attempts",
        });
      }

      // Verify password
      const isValidPassword = await user.comparePassword(password);

      if (!isValidPassword) {
        await user.incLoginAttempts();
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Reset login attempts and update last login
      if (user.loginAttempts > 0) {
        await user.updateOne({
          $unset: { loginAttempts: 1, lockUntil: 1 },
          $set: { lastLogin: new Date() },
        });
      } else {
        await user.updateOne({ lastLogin: new Date() });
      }

      // Generate token
      const token = generateToken(user._id);

      logger.info(`User logged in: ${email}`);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: user._id,
            email: user.email,
            phone: user.phone,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            kycStatus: user.kycStatus,
          },
          token,
          expiresIn: process.env.JWT_EXPIRE,
        },
      });
    } catch (error) {
      logger.error("Login error:", error);
      next(error);
    }
  }
}

module.exports = new AuthController();
