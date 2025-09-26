const nodemailer = require('nodemailer');
const logger = require('./logger');
const PasswordResetOTP = require('../models/PasswordResetOTP');
const User = require('../models/User');

class PasswordResetService {
  constructor() {
    this.transporter = null;
    this.setupTransporter();
  }

  async setupTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      await this.transporter.verify();
      console.log('✅ Password Reset SMTP connection verified successfully');

    } catch (error) {
      console.error('❌ Password Reset SMTP setup failed:', error.message);
      console.log('📧 Falling back to console logging for password reset emails');
      this.transporter = null;
    }
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createPasswordResetOTP(email, userId, ipAddress = null, userAgent = null) {
    try {
      // Cleanup any existing pending OTPs for this user
      await PasswordResetOTP.invalidateUserOTPs(userId);

      // Generate new OTP
      const otp = this.generateOTP();

      // Create new OTP record
      const otpRecord = new PasswordResetOTP({
        email: email.toLowerCase(),
        otp,
        userId,
        ipAddress,
        userAgent,
        status: 'pending',
        attempts: 0
      });

      await otpRecord.save();

      logger.info(`Password reset OTP created for user: ${email}`, {
        userId,
        otpId: otpRecord._id,
        expiresAt: otpRecord.expiresAt
      });

      return { otpRecord, otp };

    } catch (error) {
      logger.error('Error creating password reset OTP:', error);
      throw new Error('Failed to create password reset OTP');
    }
  }

  async verifyPasswordResetOTP(email, inputOTP) {
    try {
      const otpRecord = await PasswordResetOTP.findOne({
        email: email.toLowerCase(),
        status: 'pending'
      }).sort({ createdAt: -1 });

      if (!otpRecord) {
        return {
          valid: false,
          reason: 'No pending password reset request found',
          attemptsRemaining: 0
        };
      }

      // Check if expired
      if (new Date() > otpRecord.expiresAt) {
        await otpRecord.markExpired();
        return {
          valid: false,
          reason: 'OTP has expired. Please request a new password reset.',
          attemptsRemaining: 0
        };
      }

      // Increment attempts
      await otpRecord.incrementAttempts();

      // Check if OTP is valid
      if (!otpRecord.isValid(inputOTP)) {
        const attemptsRemaining = 3 - otpRecord.attempts;

        if (otpRecord.attempts >= 3) {
          return {
            valid: false,
            reason: 'Too many incorrect attempts. Please request a new password reset.',
            attemptsRemaining: 0
          };
        }

        return {
          valid: false,
          reason: 'Invalid OTP code',
          attemptsRemaining
        };
      }

      // Mark as used (don't save yet, will be done after password reset)
      logger.info(`Password reset OTP verified for user: ${email}`, {
        userId: otpRecord.userId,
        otpId: otpRecord._id
      });

      return {
        valid: true,
        otpRecord,
        userId: otpRecord.userId,
        timeRemaining: Math.max(0, Math.round((otpRecord.expiresAt - new Date()) / 1000))
      };

    } catch (error) {
      logger.error('Error verifying password reset OTP:', error);
      return {
        valid: false,
        reason: 'Error verifying OTP. Please try again.',
        attemptsRemaining: 0
      };
    }
  }

  async sendPasswordResetOTP(email, req = null) {
    try {
      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // For security, don't reveal if email exists
        return {
          success: true,
          message: 'If your email is registered, you will receive a password reset code.',
          debug: 'User not found'
        };
      }

      // Create OTP record
      const { otpRecord, otp } = await this.createPasswordResetOTP(
        email,
        user._id,
        req?.ip,
        req?.get('User-Agent')
      );

      const emailContent = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Real Estate Platform',
          address: process.env.SMTP_USER
        },
        to: email,
        subject: 'Password Reset Code - Real Estate Platform',
        html: this.generatePasswordResetEmailHTML(user, otp, otpRecord)
      };

      try {
        if (this.transporter) {
          const info = await this.transporter.sendMail(emailContent);

          logger.info(`Password reset email sent successfully to ${email}`, {
            messageId: info.messageId,
            userId: user._id,
            otpId: otpRecord._id
          });

          return {
            success: true,
            message: 'Password reset code sent to your email',
            messageId: info.messageId,
            otpId: otpRecord._id
          };

        } else {
          // Fallback to console logging
          console.log('\n=== 🔑 PASSWORD RESET EMAIL (SIMULATED) ===');
          console.log(`👤 To: ${user.firstName} ${user.lastName} (${email})`);
          console.log(`🔐 Reset Code: ${otp}`);
          console.log(`⏰ Expires: ${otpRecord.expiresAt.toLocaleString()}`);
          console.log(`📝 OTP ID: ${otpRecord._id}`);
          console.log('===========================================\n');

          return {
            success: true,
            message: 'Password reset code sent (simulated)',
            fallbackMode: true,
            otpId: otpRecord._id
          };
        }

      } catch (emailError) {
        logger.error('Error sending password reset email:', emailError);

        // Emergency fallback
        console.log('\n=== 🔑 PASSWORD RESET EMAIL (EMERGENCY FALLBACK) ===');
        console.log(`🔐 Reset Code: ${otp}`);
        console.log(`👤 User: ${user.firstName} ${user.lastName} (${email})`);
        console.log(`❌ Email failed: ${emailError.message}`);
        console.log('===============================================\n');

        return {
          success: true,
          message: 'Password reset code generated (email service unavailable)',
          fallbackMode: true,
          otpId: otpRecord._id,
          emailError: emailError.message
        };
      }

    } catch (error) {
      logger.error('Error in sendPasswordResetOTP:', error);
      throw new Error(`Failed to send password reset OTP: ${error.message}`);
    }
  }

  generatePasswordResetEmailHTML(user, otp, otpRecord) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Code</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 40px;
          }
          .otp-section {
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
          }
          .otp-label {
            color: #64748b;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 15px;
          }
          .otp-code {
            font-size: 36px;
            font-weight: 700;
            color: #dc2626;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 15px 25px;
            border-radius: 8px;
            border: 2px solid #dc2626;
            display: inline-block;
          }
          .timer {
            color: #dc2626;
            font-weight: 600;
            margin-top: 15px;
            font-size: 14px;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 20px;
            margin: 30px 0;
            border-radius: 6px;
          }
          .warning h3 {
            margin: 0 0 10px 0;
            color: #92400e;
            font-size: 16px;
          }
          .warning ul {
            margin: 10px 0 0 0;
            padding-left: 20px;
            color: #92400e;
          }
          .warning li {
            margin: 5px 0;
          }
          .footer {
            background: #f8fafc;
            color: #64748b;
            padding: 20px;
            text-align: center;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔑 Password Reset Request</h1>
          </div>

          <div class="content">
            <p>Hello ${user.firstName},</p>

            <p>We received a request to reset your password for your Real Estate Platform account. If you made this request, please use the code below:</p>

            <div class="otp-section">
              <div class="otp-label">Your 6-Digit Reset Code:</div>
              <div class="otp-code">${otp}</div>
              <div class="timer">⏰ Expires in 15 minutes</div>
            </div>

            <div class="warning">
              <h3>⚠️ Security Information</h3>
              <ul>
                <li>This code will expire in 15 minutes</li>
                <li>You have 3 attempts to enter the correct code</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Never share this code with anyone</li>
              </ul>
            </div>

            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
              If you didn't request a password reset, you can safely ignore this email.
              Your password will remain unchanged.
            </p>

            <p style="color: #64748b; font-size: 14px;">
              Request ID: ${otpRecord._id}
            </p>
          </div>

          <div class="footer">
            <p style="margin: 0;">🏢 ${process.env.EMAIL_FROM_NAME || 'Real Estate Platform'}</p>
            <p style="margin: 5px 0 0 0; font-size: 12px;">
              This is an automated security message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async markOTPAsUsed(otpId) {
    try {
      const otpRecord = await PasswordResetOTP.findById(otpId);
      if (otpRecord) {
        await otpRecord.markUsed();
      }
    } catch (error) {
      logger.error('Error marking OTP as used:', error);
    }
  }

  async cleanupExpiredOTPs() {
    try {
      const result = await PasswordResetOTP.cleanupExpired();
      if (result.modifiedCount > 0) {
        logger.info(`Cleaned up ${result.modifiedCount} expired password reset OTPs`);
      }
      return result.modifiedCount;
    } catch (error) {
      logger.error('Error cleaning up expired password reset OTPs:', error);
      return 0;
    }
  }
}

module.exports = new PasswordResetService();