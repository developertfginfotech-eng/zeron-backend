const nodemailer = require('nodemailer');
const logger = require('./logger');
const Notification = require('../models/Notification');
const User = require('../models/User');

class NotificationService {
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
      console.log('✅ Notification SMTP connection verified successfully');

    } catch (error) {
      console.error('❌ Notification SMTP setup failed:', error.message);
      console.log('📧 Falling back to console logging for notifications');
      this.transporter = null;
    }
  }

  async createNotification(userId, notificationData) {
    try {
      const notification = new Notification({
        user: userId,
        ...notificationData
      });

      await notification.save();
      logger.info(`Notification created for user ${userId}: ${notificationData.type}`);

      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async sendNotification(userId, notificationData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create notification record
      const notification = await this.createNotification(userId, notificationData);

      // Send email if user preferences allow
      if (user.preferences?.notifications?.email !== false) {
        await this.sendEmailNotification(user, notification);
      }

      return {
        success: true,
        notificationId: notification._id,
        channels: {
          database: true,
          email: user.preferences?.notifications?.email !== false
        }
      };

    } catch (error) {
      logger.error('Error sending notification:', error);
      throw new Error(`Failed to send notification: ${error.message}`);
    }
  }

  async sendEmailNotification(user, notification) {
    try {
      const emailContent = this.generateEmailContent(user, notification);

      if (this.transporter) {
        const info = await this.transporter.sendMail(emailContent);

        // Update notification status
        await notification.updateChannelStatus('email', 'sent', info.messageId);

        logger.info(`Email notification sent successfully to ${user.email}`, {
          messageId: info.messageId,
          notificationType: notification.type,
          userId: user._id
        });

        return { success: true, messageId: info.messageId };
      } else {
        // Fallback to console logging
        console.log('\n=== 📧 EMAIL NOTIFICATION (SIMULATED) ===');
        console.log(`👤 To: ${user.firstName} ${user.lastName} (${user.email})`);
        console.log(`📧 Subject: ${emailContent.subject}`);
        console.log(`💬 Type: ${notification.type}`);
        console.log(`📄 Message: ${notification.message}`);
        console.log('==========================================\n');

        // Update notification status
        await notification.updateChannelStatus('email', 'sent', 'simulated');

        return { success: true, simulated: true };
      }

    } catch (error) {
      logger.error('Error sending email notification:', error);

      // Update notification status with error
      await notification.updateChannelStatus('email', 'failed', null, error.message);

      throw error;
    }
  }

  generateEmailContent(user, notification) {
    const templates = this.getEmailTemplates();
    const template = templates[notification.type] || templates.default;

    const subject = template.subject
      .replace('{title}', notification.title)
      .replace('{firstName}', user.firstName);

    const html = this.generateEmailHTML(user, notification, template);

    return {
      from: {
        name: process.env.EMAIL_FROM_NAME || 'Real Estate Platform',
        address: process.env.SMTP_USER
      },
      to: user.email,
      subject: subject,
      html: html
    };
  }

  generateEmailHTML(user, notification, template) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${notification.title}</title>
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
            background: ${template.color};
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
          .notification-badge {
            background: ${template.badgeColor};
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
          .message-section {
            background: #f8fafc;
            border-left: 4px solid ${template.color};
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
          }
          .action-button {
            display: inline-block;
            background: ${template.color};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
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
            <h1>${template.icon} ${notification.title}</h1>
            <div class="notification-badge">${notification.type.replace('_', ' ').toUpperCase()}</div>
          </div>

          <div class="content">
            <p>Hello ${user.firstName},</p>

            <div class="message-section">
              <p><strong>${notification.message}</strong></p>
            </div>

            ${template.additionalContent}

            ${notification.actionUrl ? `
              <a href="${notification.actionUrl}" class="action-button">
                ${notification.actionLabel || 'View Details'}
              </a>
            ` : ''}

            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
              ${template.footer}
            </p>
          </div>

          <div class="footer">
            <p style="margin: 0;">🏢 ${process.env.EMAIL_FROM_NAME || 'Real Estate Platform'}</p>
            <p style="margin: 5px 0 0 0; font-size: 12px;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getEmailTemplates() {
    return {
      'user_registration': {
        subject: 'Welcome to Real Estate Platform, {firstName}!',
        icon: '🎉',
        color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        badgeColor: '#10b981',
        additionalContent: `
          <p>Thank you for joining our real estate investment platform! Your account has been successfully created.</p>
          <p><strong>Next steps:</strong></p>
          <ul>
            <li>Complete your KYC verification to start investing</li>
            <li>Explore available properties</li>
            <li>Set up your investment preferences</li>
          </ul>
        `,
        footer: 'Welcome aboard! We\'re excited to help you start your investment journey.'
      },
      'kyc_approved': {
        subject: 'KYC Verification Approved - Start Investing Now!',
        icon: '✅',
        color: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        badgeColor: '#10b981',
        additionalContent: `
          <p>Congratulations! Your KYC verification has been approved and you can now start investing in properties.</p>
          <p><strong>What you can do now:</strong></p>
          <ul>
            <li>Browse and invest in available properties</li>
            <li>View detailed property analytics</li>
            <li>Track your investment portfolio</li>
            <li>Receive monthly rental income</li>
          </ul>
        `,
        footer: 'Your investment journey starts now!'
      },
      'kyc_rejected': {
        subject: 'KYC Verification - Additional Information Required',
        icon: '❌',
        color: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        badgeColor: '#ef4444',
        additionalContent: `
          <p>Your KYC verification needs additional information or documentation.</p>
          <p><strong>Please review and update:</strong></p>
          <ul>
            <li>Upload clear, high-quality documents</li>
            <li>Ensure all information is accurate</li>
            <li>Contact support if you need assistance</li>
          </ul>
        `,
        footer: 'We\'re here to help you complete your verification.'
      },
      'new_user_registration': {
        subject: 'New User Registration - {userName}',
        icon: '👤',
        color: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        badgeColor: '#3b82f6',
        additionalContent: `
          <p>A new user has registered on the platform.</p>
          <p><strong>User Details:</strong></p>
          <ul>
            <li>Registration Date: {registrationDate}</li>
            <li>Email: {userEmail}</li>
            <li>Status: Awaiting KYC verification</li>
          </ul>
        `,
        footer: 'Monitor user onboarding from the admin dashboard.'
      },
      'kyc_approved_admin': {
        subject: 'KYC Approved - {userName}',
        icon: '✅',
        color: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        badgeColor: '#10b981',
        additionalContent: `
          <p>A user's KYC verification has been approved.</p>
          <p><strong>User Details:</strong></p>
          <ul>
            <li>Approval Date: {approvalDate}</li>
            <li>Email: {userEmail}</li>
            <li>Status: Ready to invest</li>
          </ul>
        `,
        footer: 'User can now access all platform features.'
      },
      'new_property_added': {
        subject: 'New Property Added - {propertyTitle}',
        icon: '🏢',
        color: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        badgeColor: '#8b5cf6',
        additionalContent: `
          <p>A new property has been added to the platform.</p>
          <p><strong>Property Details:</strong></p>
          <ul>
            <li>Location: {propertyLocation}</li>
            <li>Value: {propertyValue} SAR</li>
            <li>Added by: {createdBy}</li>
            <li>Date: {creationDate}</li>
          </ul>
        `,
        footer: 'Review and monitor new property listings.'
      },
      'default': {
        subject: '{title}',
        icon: '📢',
        color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        badgeColor: '#667eea',
        additionalContent: '',
        footer: 'Thank you for using our platform.'
      }
    };
  }

  // Helper method to get admin users
  async getAdminUsers() {
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'super_admin'] },
        status: 'active',
        isActive: true,
        'preferences.notifications.email': { $ne: false }
      });
      return admins;
    } catch (error) {
      logger.error('Error fetching admin users:', error);
      return [];
    }
  }

  // Specific notification methods
  async notifyUserRegistration(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Send welcome notification to the new user
      const userNotificationData = {
        type: 'user_registration',
        title: 'Welcome to Real Estate Platform!',
        message: 'Your account has been successfully created. Complete your KYC verification to start investing.',
        priority: 'normal',
        actionUrl: '/kyc-verification',
        actionLabel: 'Complete KYC',
        relatedEntity: {
          entityType: 'user',
          entityId: userId
        }
      };

      const userResult = await this.sendNotification(userId, userNotificationData);

      // Send notification to all admins about new user registration
      const admins = await this.getAdminUsers();
      if (admins.length > 0) {
        const adminNotificationData = {
          type: 'new_user_registration',
          title: 'New User Registration',
          message: `${user.firstName} ${user.lastName} (${user.email}) has registered on the platform.`,
          priority: 'normal',
          actionUrl: `/admin/users/${userId}`,
          actionLabel: 'View User',
          relatedEntity: {
            entityType: 'user',
            entityId: userId
          },
          data: {
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            registrationDate: user.createdAt
          }
        };

        const adminResults = await Promise.allSettled(
          admins.map(admin => this.sendNotification(admin._id, adminNotificationData))
        );

        logger.info(`Admin notifications sent for new user registration: ${user.email}`, {
          adminCount: admins.length,
          successCount: adminResults.filter(r => r.status === 'fulfilled').length
        });
      }

      return userResult;

    } catch (error) {
      logger.error('Error in notifyUserRegistration:', error);
      throw error;
    }
  }

  async notifyKYCApproved(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Send approval notification to user
      const userNotificationData = {
        type: 'kyc_approved',
        title: 'KYC Verification Approved!',
        message: 'Congratulations! Your KYC verification has been approved. You can now start investing in properties.',
        priority: 'high',
        actionUrl: '/properties',
        actionLabel: 'Browse Properties',
        relatedEntity: {
          entityType: 'kyc',
          entityId: userId
        }
      };

      const userResult = await this.sendNotification(userId, userNotificationData);

      // Send notification to all admins about KYC approval
      const admins = await this.getAdminUsers();
      if (admins.length > 0) {
        const adminNotificationData = {
          type: 'kyc_approved_admin',
          title: 'KYC Verification Approved',
          message: `KYC verification for ${user.firstName} ${user.lastName} (${user.email}) has been approved.`,
          priority: 'normal',
          actionUrl: `/admin/kyc/${userId}`,
          actionLabel: 'View KYC',
          relatedEntity: {
            entityType: 'kyc',
            entityId: userId
          },
          data: {
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            approvalDate: new Date()
          }
        };

        const adminResults = await Promise.allSettled(
          admins.map(admin => this.sendNotification(admin._id, adminNotificationData))
        );

        logger.info(`Admin notifications sent for KYC approval: ${user.email}`, {
          adminCount: admins.length,
          successCount: adminResults.filter(r => r.status === 'fulfilled').length
        });
      }

      return userResult;

    } catch (error) {
      logger.error('Error in notifyKYCApproved:', error);
      throw error;
    }
  }

  async notifyKYCRejected(userId, rejectionReason = '') {
    const message = rejectionReason
      ? `Your KYC verification was rejected: ${rejectionReason}. Please update your documents and try again.`
      : 'Your KYC verification needs additional information. Please review and update your documents.';

    const notificationData = {
      type: 'kyc_rejected',
      title: 'KYC Verification - Action Required',
      message: message,
      priority: 'high',
      actionUrl: '/kyc-verification',
      actionLabel: 'Update KYC',
      relatedEntity: {
        entityType: 'kyc',
        entityId: userId
      }
    };

    return await this.sendNotification(userId, notificationData);
  }

  // Admin notification for new property addition
  async notifyNewPropertyAdded(propertyId, createdByUserId) {
    try {
      const Property = require('../models/Property');
      const property = await Property.findById(propertyId).populate('createdBy', 'firstName lastName email');
      if (!property) throw new Error('Property not found');

      const createdBy = await User.findById(createdByUserId);
      if (!createdBy) throw new Error('Creator user not found');

      // Send notification to all admins about new property
      const admins = await this.getAdminUsers();
      if (admins.length > 0) {
        const adminNotificationData = {
          type: 'new_property_added',
          title: 'New Property Added',
          message: `New property "${property.title}" has been added by ${createdBy.firstName} ${createdBy.lastName}.`,
          priority: 'normal',
          actionUrl: `/admin/properties/${propertyId}`,
          actionLabel: 'View Property',
          relatedEntity: {
            entityType: 'property',
            entityId: propertyId
          },
          data: {
            propertyTitle: property.title,
            propertyLocation: `${property.location.city}, ${property.location.district}`,
            createdBy: `${createdBy.firstName} ${createdBy.lastName}`,
            createdByEmail: createdBy.email,
            propertyValue: property.financials?.totalValue || 0,
            creationDate: property.createdAt
          }
        };

        const adminResults = await Promise.allSettled(
          admins.map(admin => this.sendNotification(admin._id, adminNotificationData))
        );

        logger.info(`Admin notifications sent for new property: ${property.title}`, {
          adminCount: admins.length,
          successCount: adminResults.filter(r => r.status === 'fulfilled').length
        });
      }

      return {
        success: true,
        notificationsSent: admins.length
      };

    } catch (error) {
      logger.error('Error in notifyNewPropertyAdded:', error);
      throw error;
    }
  }

  // Send bulk notifications
  async sendBulkNotification(userIds, notificationData) {
    try {
      const results = {
        success: true,
        totalUsers: userIds.length,
        sent: 0,
        failed: 0,
        errors: []
      };

      const promises = userIds.map(async (userId) => {
        try {
          await this.sendNotification(userId, notificationData);
          results.sent++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: userId,
            error: error.message
          });
        }
      });

      await Promise.allSettled(promises);

      logger.info(`Bulk notification completed`, {
        totalUsers: results.totalUsers,
        sent: results.sent,
        failed: results.failed,
        notificationType: notificationData.type
      });

      return results;

    } catch (error) {
      logger.error('Error in sendBulkNotification:', error);
      throw new Error(`Failed to send bulk notification: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      if (!this.transporter) {
        return {
          success: false,
          message: 'SMTP not configured',
          mode: 'simulation'
        };
      }

      await this.transporter.verify();
      return {
        success: true,
        message: 'SMTP connection active',
        mode: 'live'
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        mode: 'error'
      };
    }
  }
}

module.exports = new NotificationService();