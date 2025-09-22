const nodemailer = require('nodemailer');
const logger = require('./logger');
const SimpleOTP = require('../models/SimpleOTP');

class OTPEmailService {
  constructor() {
    this.transporter = null;
    this.setupTransporter();
  }

  async setupTransporter() {
    try {
      // Create Gmail transporter with your credentials
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

      // Verify the connection
      await this.transporter.verify();
      console.log('✅ Gmail SMTP connection verified successfully');
      console.log(`📧 Emails will be sent from: ${process.env.SMTP_USER}`);
      console.log(`📧 OTP emails will be sent to: ${process.env.SUPER_ADMIN_EMAIL}`);
      
    } catch (error) {
      console.error('❌ Gmail SMTP setup failed:', error.message);
      console.log('📧 Falling back to console logging for OTP codes');
      this.transporter = null;
    }
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createOTPRecord({ operation, propertyData, propertyId, requestedBy }) {
    try {
      // Clean up any existing pending OTPs for this user and operation
      await SimpleOTP.updateMany(
        { 
          requestedBy, 
          operation, 
          status: 'pending' 
        },
        { 
          status: 'expired' 
        }
      );

      // Generate new OTP
      const otp = this.generateOTP();

      // Create new OTP record
      const otpRecord = new SimpleOTP({
        otp,
        operation,
        propertyData,
        propertyId,
        requestedBy,
        status: 'pending',
        attempts: 0
      });

      await otpRecord.save();
      logger.info(`OTP record created - User: ${requestedBy}, Operation: ${operation}, OTP ID: ${otpRecord._id}`);

      return { otpRecord, otp };
    } catch (error) {
      logger.error('Error creating OTP record:', error);
      throw new Error('Failed to create OTP record');
    }
  }

  async verifyOTP(userId, inputOTP, operation) {
    try {
      // Find the most recent pending OTP for this user and operation
      const otpRecord = await SimpleOTP.findOne({
        requestedBy: userId,
        operation,
        status: 'pending'
      }).sort({ createdAt: -1 });

      if (!otpRecord) {
        return {
          valid: false,
          reason: 'No pending OTP found for this operation',
          attemptsRemaining: 0
        };
      }

      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();

      // Check if OTP is valid using the model method
      if (!otpRecord.isValid(inputOTP)) {
        const attemptsRemaining = 3 - otpRecord.attempts;
        
        // If max attempts reached, mark as expired
        if (otpRecord.attempts >= 3) {
          otpRecord.status = 'expired';
          await otpRecord.save();
          return {
            valid: false,
            reason: 'Too many incorrect attempts. Please request a new OTP.',
            attemptsRemaining: 0
          };
        }

        // Check if expired
        if (new Date() > otpRecord.expiresAt) {
          otpRecord.status = 'expired';
          await otpRecord.save();
          return {
            valid: false,
            reason: 'OTP has expired. Please request a new one.',
            attemptsRemaining: 0
          };
        }

        return {
          valid: false,
          reason: 'Invalid OTP code',
          attemptsRemaining
        };
      }

      // Mark as used
      await otpRecord.markUsed();
      logger.info(`OTP verified successfully - User: ${userId}, Operation: ${operation}, OTP ID: ${otpRecord._id}`);

      return {
        valid: true,
        otpRecord,
        timeRemaining: Math.max(0, Math.round((otpRecord.expiresAt - new Date()) / 1000))
      };

    } catch (error) {
      logger.error('Error verifying OTP:', error);
      return {
        valid: false,
        reason: 'Error verifying OTP. Please try again.',
        attemptsRemaining: 0
      };
    }
  }

  async getOTPStatus(userId) {
    try {
      const otpRecord = await SimpleOTP.findOne({
        requestedBy: userId,
        status: 'pending'
      }).sort({ createdAt: -1 });

      if (!otpRecord) {
        return { hasActiveOTP: false };
      }

      // Check if expired
      if (new Date() > otpRecord.expiresAt) {
        otpRecord.status = 'expired';
        await otpRecord.save();
        return { hasActiveOTP: false };
      }

      const timeLeft = Math.max(0, Math.round((otpRecord.expiresAt - new Date()) / 1000));
      const attemptsRemaining = 3 - otpRecord.attempts;

      return {
        hasActiveOTP: true,
        operation: otpRecord.operation,
        timeLeft,
        attemptsRemaining,
        propertyData: otpRecord.propertyData,
        createdAt: otpRecord.createdAt
      };

    } catch (error) {
      logger.error('Error getting OTP status:', error);
      return { hasActiveOTP: false };
    }
  }

  async sendOTP({ operation, propertyData, adminUser, propertyId = null }) {
    try {
      // Create OTP record in database
      const { otpRecord, otp } = await this.createOTPRecord({
        operation,
        propertyData,
        propertyId,
        requestedBy: adminUser._id
      });

      const operationTexts = {
        create: 'Create Property',
        update: 'Update Property',
        delete: 'Delete Property'
      };

      const operationColors = {
        create: '#10b981',
        update: '#f59e0b',
        delete: '#ef4444'
      };

      const emailContent = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Property Management System',
          address: process.env.SMTP_USER
        },
        to: process.env.SUPER_ADMIN_EMAIL,
        subject: `🔐 OTP Required: ${operationTexts[operation]} - ${propertyData.title || 'New Property'}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>OTP Verification Required</title>
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                padding: 30px; 
                text-align: center; 
              }
              .header h1 { 
                margin: 0; 
                font-size: 24px; 
                font-weight: 600; 
              }
              .operation-badge {
                background: ${operationColors[operation]};
                color: white;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-top: 10px;
                display: inline-block;
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
                color: #1e293b; 
                letter-spacing: 8px; 
                font-family: 'Courier New', monospace; 
                background: white;
                padding: 15px 25px;
                border-radius: 8px;
                border: 2px solid #3b82f6;
                display: inline-block;
              }
              .timer {
                color: #dc2626;
                font-weight: 600;
                margin-top: 15px;
                font-size: 14px;
              }
              .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin: 30px 0;
                background: #f1f5f9;
                padding: 20px;
                border-radius: 8px;
              }
              .info-item {
                text-align: left;
              }
              .info-label {
                font-weight: 600;
                color: #475569;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 5px;
              }
              .info-value {
                color: #1e293b;
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
              .otp-id {
                font-size: 12px;
                color: #94a3b8;
                margin-top: 10px;
              }
              @media (max-width: 600px) {
                .info-grid {
                  grid-template-columns: 1fr;
                }
                .otp-code {
                  font-size: 28px;
                  letter-spacing: 6px;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔐 Admin Verification Required</h1>
                <div class="operation-badge">${operationTexts[operation]}</div>
              </div>
              
              <div class="content">
                <div class="info-grid">
                  <div class="info-item">
                    <div class="info-label">Operation</div>
                    <div class="info-value">${operationTexts[operation]}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Property</div>
                    <div class="info-value">${propertyData.title || 'New Property'}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Requested By</div>
                    <div class="info-value">${adminUser.firstName} ${adminUser.lastName}</div>
                  </div>
                  <div class="info-item">
                    <div class="info-label">Time</div>
                    <div class="info-value">${new Date().toLocaleString('en-US', { 
                      timeZone: 'Asia/Riyadh',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })} KSA</div>
                  </div>
                </div>

                <div class="otp-section">
                  <div class="otp-label">Your 6-Digit OTP Code:</div>
                  <div class="otp-code">${otp}</div>
                  <div class="timer">⏰ Expires in 10 minutes</div>
                  <div class="otp-id">Request ID: ${otpRecord._id}</div>
                </div>

                <div class="warning">
                  <h3>⚠️ Security Instructions</h3>
                  <ul>
                    <li>Share this code only with the admin who requested it</li>
                    <li>This code is required to complete the ${operation} operation</li>
                    <li>If you didn't authorize this operation, contact IT security immediately</li>
                    <li>Code automatically expires in 10 minutes for security</li>
                    <li>Maximum 3 attempts allowed per request</li>
                  </ul>
                </div>

                <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                  The admin is waiting for this code to complete the operation. If you're unable to provide it, 
                  the request will automatically expire in 10 minutes.
                </p>
              </div>

              <div class="footer">
                <p style="margin: 0;">🏢 Property Management System - Automated Security Message</p>
                <p style="margin: 5px 0 0 0; font-size: 12px;">Do not reply to this email</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      try {
        // If transporter is available, send real email
        if (this.transporter) {
          const info = await this.transporter.sendMail(emailContent);
          
          console.log('✅ OTP Email sent successfully');
          console.log(`📧 Message ID: ${info.messageId}`);
          console.log(`📧 To: ${process.env.SUPER_ADMIN_EMAIL}`);
          console.log(`🔐 OTP Code: ${otp} (for operation: ${operation})`);
          console.log(`📝 Database ID: ${otpRecord._id}`);
          
          logger.info(`OTP sent successfully to ${process.env.SUPER_ADMIN_EMAIL} for ${operation} operation`, {
            messageId: info.messageId,
            operation,
            propertyTitle: propertyData.title,
            requestedBy: adminUser.email,
            otpId: otpRecord._id
          });
          
          return { 
            success: true, 
            messageId: info.messageId,
            sentTo: process.env.SUPER_ADMIN_EMAIL,
            otpId: otpRecord._id
          };
          
        } else {
          // Fallback to console logging
          console.log('\n=== 📧 OTP EMAIL (FALLBACK - EMAIL SERVICE UNAVAILABLE) ===');
          console.log(`🔐 OTP Code: ${otp}`);
          console.log(`📋 Operation: ${operation}`);
          console.log(`🏢 Property: ${propertyData.title || 'New Property'}`);
          console.log(`👤 Requested by: ${adminUser.firstName} ${adminUser.lastName}`);
          console.log(`⏰ Time: ${new Date().toLocaleString()}`);
          console.log(`📧 Should be sent to: ${process.env.SUPER_ADMIN_EMAIL}`);
          console.log(`📝 Database ID: ${otpRecord._id}`);
          console.log('===============================================\n');
          
          return { 
            success: true, 
            fallbackMode: true,
            sentTo: 'console-log',
            otpId: otpRecord._id
          };
        }
        
      } catch (emailError) {
        // Emergency fallback
        console.log('\n=== 📧 OTP EMAIL (EMERGENCY FALLBACK) ===');
        console.log(`🔐 OTP Code: ${otp}`);
        console.log(`📋 Operation: ${operation}`);
        console.log(`🏢 Property: ${propertyData.title || 'New Property'}`);
        console.log(`❌ Email failed: ${emailError.message}`);
        console.log(`📝 Database ID: ${otpRecord._id}`);
        console.log('=========================================\n');
        
        return { 
          success: true, 
          fallbackMode: true,
          sentTo: 'console-log-emergency',
          otpId: otpRecord._id,
          emailError: emailError.message
        };
      }

    } catch (error) {
      logger.error('Error in sendOTP:', error);
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  // Cleanup expired OTPs
  async cleanupExpiredOTPs() {
    try {
      const result = await SimpleOTP.updateMany(
        {
          status: 'pending',
          expiresAt: { $lt: new Date() }
        },
        { status: 'expired' }
      );
      
      if (result.modifiedCount > 0) {
        logger.info(`Cleaned up ${result.modifiedCount} expired OTPs`);
      }
      
      return result.modifiedCount;
    } catch (error) {
      logger.error('Error cleaning up expired OTPs:', error);
      return 0;
    }
  }
}

module.exports = new OTPEmailService();