const User = require("../models/User");
const KYC = require("../models/KYC");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const logger = require("../utils/logger");
const notificationService = require("../utils/notificationService");
const passwordResetService = require("../utils/passwordResetService");

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

      // Send welcome notification
      try {
        await notificationService.notifyUserRegistration(user._id);
        logger.info(`Welcome notification sent to user: ${email}`);
      } catch (notificationError) {
        logger.error('Failed to send welcome notification:', notificationError);
        // Continue without failing the registration
      }

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

  // Forgot password - send OTP
  async forgotPassword(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email } = req.body;

      // Send password reset OTP
      const result = await passwordResetService.sendPasswordResetOTP(email, req);

      logger.info(`Password reset OTP requested for: ${email}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        otpId: result.otpId
      });

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          email: email,
          otpId: result.otpId,
          fallbackMode: result.fallbackMode || false
        }
      });

    } catch (error) {
      logger.error("Forgot password error:", error);
      next(error);
    }
  }

  // Reset password with OTP
  async resetPassword(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email, otp, newPassword } = req.body;

      // Verify OTP
      const otpVerification = await passwordResetService.verifyPasswordResetOTP(email, otp);

      if (!otpVerification.valid) {
        return res.status(400).json({
          success: false,
          message: otpVerification.reason,
          attemptsRemaining: otpVerification.attemptsRemaining
        });
      }

      // Find user and update password
      const user = await User.findById(otpVerification.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Update password (the User model should hash it automatically)
      user.password = newPassword;
      await user.save();

      // Mark OTP as used
      await otpVerification.otpRecord.markUsed();

      logger.info(`Password reset successful for user: ${email}`, {
        userId: user._id,
        ip: req.ip,
        otpId: otpVerification.otpRecord._id
      });

      res.status(200).json({
        success: true,
        message: "Password reset successful. You can now login with your new password.",
        data: {
          email: user.email,
          resetAt: new Date()
        }
      });

    } catch (error) {
      logger.error("Reset password error:", error);
      next(error);
    }
  }

  // Verify password reset OTP (optional endpoint for validation)
  async verifyResetOTP(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { email, otp } = req.body;

      // Verify OTP
      const otpVerification = await passwordResetService.verifyPasswordResetOTP(email, otp);

      if (!otpVerification.valid) {
        return res.status(400).json({
          success: false,
          message: otpVerification.reason,
          attemptsRemaining: otpVerification.attemptsRemaining
        });
      }

      res.status(200).json({
        success: true,
        message: "OTP verified successfully. You can now reset your password.",
        data: {
          email: email,
          timeRemaining: otpVerification.timeRemaining,
          validUntil: otpVerification.otpRecord.expiresAt
        }
      });

    } catch (error) {
      logger.error("Verify reset OTP error:", error);
      next(error);
    }
  }
}

module.exports = new AuthController();
