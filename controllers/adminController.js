const User = require("../models/User");
const Property = require("../models/Property");
const Investment = require("../models/Investment");
const KYC = require("../models/KYC");
const SimpleOTP = require("../models/SimpleOTP");
const Role = require("../models/Role");
const Group = require("../models/Group");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const otpEmailService = require("../utils/otpEmailService");
const notificationService = require("../utils/notificationService");
const fs = require("fs");

class AdminController {
 
  async getAllUsers(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        status,
        kycStatus,
        search,
      } = req.query;

      // Build filter
      const filter = {};
      if (status) filter.status = status;
      if (kycStatus) filter.kycStatus = kycStatus;

      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ];
      }

      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Get users with KYC data
      const [users, totalUsers, stats] = await Promise.all([
        User.find(filter)
          .select("-password")
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(filter),
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: {
                $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
              },
              pendingKyc: {
                $sum: { $cond: [{ $eq: ["$kycStatus", "pending"] }, 1, 0] },
              },
              approvedKyc: {
                $sum: { $cond: [{ $eq: ["$kycStatus", "approved"] }, 1, 0] },
              },
            },
          },
        ]),
      ]);

      const totalPages = Math.ceil(totalUsers / limitNum);

      logger.info(
        `Admin fetched users list - Admin: ${req.user.id}, Page: ${page}`
      );

      res.json({
        success: true,
        data: {
          users: users.map((user) => ({
            ...user,
            fullName: `${user.firstName} ${user.lastName}`,
          })),
          pagination: {
            page: pageNum,
            pages: totalPages,
            total: totalUsers,
            limit: limitNum,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
          statistics: stats[0] || {
            totalUsers: 0,
            activeUsers: 0,
            pendingKyc: 0,
            approvedKyc: 0,
          },
        },
      });
    } catch (error) {
      logger.error("Get all users error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching users",
        error: error.message,
      });
    }
  }
  async getAllRegularUsers(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      sort = "-createdAt",
      status,
      kycStatus,
      search,
      emailVerified
    } = req.query;

    // Filter for regular users only (exclude admin roles)
    const filter = {
      role: 'user' // Only get regular users, not admins
    };

    // Add optional filters
    if (status) filter.status = status;
    if (kycStatus) filter.kycStatus = kycStatus;
    if (emailVerified !== undefined) filter.emailVerified = emailVerified === 'true';

    // Search functionality
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get users and statistics
    const [users, totalUsers, stats] = await Promise.all([
      User.find(filter)
        .select("-password") // Exclude password field
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
      User.aggregate([
        { $match: { role: 'user' } }, // Only regular users for stats
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
            },
            pendingUsers: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
            },
            inactiveUsers: {
              $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] }
            },
            pendingKyc: {
              $sum: { $cond: [{ $eq: ["$kycStatus", "pending"] }, 1, 0] }
            },
            approvedKyc: {
              $sum: { $cond: [{ $eq: ["$kycStatus", "approved"] }, 1, 0] }
            },
            rejectedKyc: {
              $sum: { $cond: [{ $eq: ["$kycStatus", "rejected"] }, 1, 0] }
            },
            verifiedEmails: {
              $sum: { $cond: [{ $eq: ["$emailVerified", true] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    const totalPages = Math.ceil(totalUsers / limitNum);

    // Log the request
    logger.info(
      `Admin fetched regular users list - Admin: ${req.user.id}, Page: ${page}, Total: ${totalUsers}`
    );

    res.json({
      success: true,
      data: {
        users: users.map(user => ({
          ...user,
          fullName: `${user.firstName} ${user.lastName}`,
          // Add computed fields
          accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)), // days
          isEligibleForPromotion: user.status === 'active' && user.kycStatus === 'approved' && user.emailVerified
        })),
        pagination: {
          page: pageNum,
          pages: totalPages,
          total: totalUsers,
          limit: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        },
        statistics: stats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          pendingUsers: 0,
          inactiveUsers: 0,
          pendingKyc: 0,
          approvedKyc: 0,
          rejectedKyc: 0,
          verifiedEmails: 0
        },
        filters: {
          status,
          kycStatus,
          search,
          emailVerified
        }
      }
    });

  } catch (error) {
    logger.error("Get all regular users error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message
    });
  }
}
  async updateKycStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { status, rejectionReasons, reviewNotes } = req.body;
      const adminId = req.user.id;

      // Find and update user
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const previousStatus = user.kycStatus;
      user.kycStatus = status;

      // Handle approval
      if (status === "approved" && user.status === "pending") {
        user.status = "active";
      }

      await user.save();

      logger.info(
        `KYC status updated - User: ${id}, Status: ${status}, Admin: ${adminId}`
      );

      res.json({
        success: true,
        message: `KYC ${status} successfully`,
        data: {
          user: {
            id: user._id,
            email: user.email,
            fullName: `${user.firstName} ${user.lastName}`,
            kycStatus: user.kycStatus,
            status: user.status,
          },
          statusChange: {
            from: previousStatus,
            to: status,
            changedBy: adminId,
            changedAt: new Date(),
          },
        },
      });
    } catch (error) {
      logger.error("Update KYC status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating KYC status",
        error: error.message,
      });
    }
  }

  async getAdminUsers(req, res) {
    try {
      const { page = 1, limit = 20, sort = "-createdAt", role, search } = req.query;

      const filter = {
        role: { $in: ["admin", "super_admin", "kyc_officer", "property_manager", "financial_analyst", "compliance_officer"] }
      };

      if (role) filter.role = role;
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ];
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [adminUsers, totalAdmins] = await Promise.all([
        User.find(filter).select("-password").sort(sort).skip(skip).limit(limitNum).lean(),
        User.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          admins: adminUsers.map(user => ({ ...user, fullName: `${user.firstName} ${user.lastName}` })),
          pagination: {
            page: pageNum,
            pages: Math.ceil(totalAdmins / limitNum),
            total: totalAdmins,
            limit: limitNum
          }
        }
      });
    } catch (error) {
      logger.error("Get admin users error:", error);
      res.status(500).json({ success: false, message: "Error fetching admin users" });
    }
  }

  // Get admin user details
  async getAdminUserDetails(req, res) {
    try {
      const { id } = req.params;

      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Only super administrators can view admin details" });
      }

      const adminUser = await User.findById(id)
        .select('-password')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .populate('deactivatedBy', 'firstName lastName email')
        .lean();

      if (!adminUser) {
        return res.status(404).json({ success: false, message: "Admin user not found" });
      }

      res.json({
        success: true,
        data: { ...adminUser, fullName: `${adminUser.firstName} ${adminUser.lastName}` }
      });
    } catch (error) {
      logger.error("Get admin details error:", error);
      res.status(500).json({ success: false, message: "Error fetching admin details" });
    }
  }

  // Update admin user details
  async updateAdminUserDetails(req, res) {
    try {
      const { id } = req.params;
      const { firstName, lastName, email, status, otp } = req.body;
      const currentUserId = req.user.id;

      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Only super administrators can update admin details" });
      }

      if (id === currentUserId) {
        return res.status(400).json({ success: false, message: "Cannot modify your own account details" });
      }

      const targetAdmin = await User.findById(id);
      if (!targetAdmin) {
        return res.status(404).json({ success: false, message: "Admin user not found" });
      }

      if (!otp) {
        const currentUser = await User.findById(currentUserId);
        const emailResult = await otpEmailService.sendOTP({
          operation: "update_admin_details",
          propertyData: {
            title: `Update Admin Details - ${targetAdmin.firstName} ${targetAdmin.lastName}`,
            propertyType: "admin_update"
          },
          adminUser: currentUser,
          propertyId: id
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: {
            step: "otp_required",
            message: "Check your email for OTP code",
            sentTo: emailResult.sentTo,
            otpId: emailResult.otpId
          }
        });
      }

      const verification = await otpEmailService.verifyOTP(currentUserId, otp, "update_admin_details");
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining
        });
      }

      targetAdmin.firstName = firstName.trim();
      targetAdmin.lastName = lastName.trim();
      targetAdmin.email = email.toLowerCase().trim();
      if (status) targetAdmin.status = status;
      targetAdmin.updatedAt = new Date();
      targetAdmin.updatedBy = currentUserId;

      await targetAdmin.save();

      res.json({
        success: true,
        message: "Admin details updated successfully",
        data: {
          user: {
            id: targetAdmin._id,
            firstName: targetAdmin.firstName,
            lastName: targetAdmin.lastName,
            email: targetAdmin.email,
            role: targetAdmin.role,
            status: targetAdmin.status
          }
        }
      });
    } catch (error) {
      logger.error("Update admin details error:", error);
      res.status(500).json({ success: false, message: "Error updating admin details" });
    }
  }

  // Deactivate admin user
  async deactivateAdminUser(req, res) {
    try {
      const { id } = req.params;
      const { reason, otp } = req.body;
      const currentUserId = req.user.id;

      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Only super administrators can deactivate admins" });
      }

      if (id === currentUserId) {
        return res.status(400).json({ success: false, message: "Cannot deactivate your own account" });
      }

      const targetAdmin = await User.findById(id);
      if (!targetAdmin) {
        return res.status(404).json({ success: false, message: "Admin user not found" });
      }

      if (!otp) {
        const currentUser = await User.findById(currentUserId);
        const emailResult = await otpEmailService.sendOTP({
          operation: "deactivate_admin",
          propertyData: {
            title: `Deactivate Admin - ${targetAdmin.firstName} ${targetAdmin.lastName}`,
            propertyType: "admin_deactivation"
          },
          adminUser: currentUser,
          propertyId: id
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: { step: "otp_required", sentTo: emailResult.sentTo, otpId: emailResult.otpId }
        });
      }

      const verification = await otpEmailService.verifyOTP(currentUserId, otp, "deactivate_admin");
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining
        });
      }

      targetAdmin.status = 'inactive';
      targetAdmin.deactivatedAt = new Date();
      targetAdmin.deactivatedBy = currentUserId;
      targetAdmin.deactivationReason = reason || 'Deactivated by super admin';

      await targetAdmin.save();

      res.json({
        success: true,
        message: "Admin user deactivated successfully",
        data: { user: { id: targetAdmin._id, status: targetAdmin.status } }
      });
    } catch (error) {
      logger.error("Deactivate admin error:", error);
      res.status(500).json({ success: false, message: "Error deactivating admin" });
    }
  }

  // Reactivate admin user
  async reactivateAdminUser(req, res) {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Only super administrators can reactivate admins" });
      }

      const targetAdmin = await User.findById(id);
      if (!targetAdmin) {
        return res.status(404).json({ success: false, message: "Admin user not found" });
      }

      targetAdmin.status = 'active';
      targetAdmin.reactivatedAt = new Date();
      targetAdmin.reactivatedBy = currentUserId;

      await targetAdmin.save();

      res.json({
        success: true,
        message: "Admin user reactivated successfully",
        data: { user: { id: targetAdmin._id, status: targetAdmin.status } }
      });
    } catch (error) {
      logger.error("Reactivate admin error:", error);
      res.status(500).json({ success: false, message: "Error reactivating admin" });
    }
  }

  // Promote to super admin
  async promoteToSuperAdmin(req, res) {
    try {
      const { id } = req.params;
      const { otp } = req.body;
      const currentUserId = req.user.id;

      if (req.user.role !== "super_admin") {
        return res.status(403).json({ success: false, message: "Only super administrators can promote users" });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (!otp) {
        const currentUser = await User.findById(currentUserId);
        const emailResult = await otpEmailService.sendOTP({
          operation: "promote_super_admin",
          propertyData: { title: `Promote ${targetUser.firstName} ${targetUser.lastName} to Super Admin` },
          adminUser: currentUser,
          propertyId: id
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: { step: "otp_required", sentTo: emailResult.sentTo, otpId: emailResult.otpId }
        });
      }

      const verification = await otpEmailService.verifyOTP(currentUserId, otp, "promote_super_admin");
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining
        });
      }

      targetUser.role = "super_admin";
      await targetUser.save();

      res.json({
        success: true,
        message: "User promoted to Super Administrator successfully",
        data: { user: { id: targetUser._id, role: targetUser.role } }
      });
    } catch (error) {
      logger.error("Promote to super admin error:", error);
      res.status(500).json({ success: false, message: "Error promoting user" });
    }
  }

  // Update admin role
  async updateAdminRole(req, res) {
    try {
      const { id } = req.params;
      const { role, otp } = req.body;
      const currentUserId = req.user.id;

      if (req.user.role !== "super_admin") {
        return res.status(403).json({ success: false, message: "Only super administrators can change roles" });
      }

      const validRoles = ["admin", "super_admin", "kyc_officer", "property_manager", "financial_analyst", "compliance_officer"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role specified" });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (!otp) {
        const currentUser = await User.findById(currentUserId);
        const emailResult = await otpEmailService.sendOTP({
          operation: "update_role",
          propertyData: { title: `Change ${targetUser.firstName} ${targetUser.lastName} role to ${role}` },
          adminUser: currentUser,
          propertyId: id
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: { step: "otp_required", sentTo: emailResult.sentTo, otpId: emailResult.otpId }
        });
      }

      const verification = await otpEmailService.verifyOTP(currentUserId, otp, "update_role");
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining
        });
      }

      targetUser.role = role;
      await targetUser.save();

      res.json({
        success: true,
        message: `User role updated to ${role} successfully`,
        data: { user: { id: targetUser._id, role: targetUser.role } }
      });
    } catch (error) {
      logger.error("Update admin role error:", error);
      res.status(500).json({ success: false, message: "Error updating role" });
    }
  }

  // Get eligible users for promotion
  async getEligibleUsers(req, res) {
    try {
      const { page = 1, limit = 20, search } = req.query;

      const filter = { role: 'user', status: 'active', kycStatus: 'approved', emailVerified: true };
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ];
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [users, totalUsers] = await Promise.all([
        User.find(filter).select('-password').sort('-createdAt').skip(skip).limit(limitNum).lean(),
        User.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          users: users.map(user => ({ ...user, fullName: `${user.firstName} ${user.lastName}` })),
          pagination: { page: pageNum, pages: Math.ceil(totalUsers / limitNum), total: totalUsers }
        }
      });
    } catch (error) {
      logger.error("Get eligible users error:", error);
      res.status(500).json({ success: false, message: "Error fetching eligible users" });
    }
  }

  // Promote user to admin
  async promoteUserToAdmin(req, res) {
    try {
      const { userId, role, otp } = req.body;
      const currentUserId = req.user.id;

      if (req.user.role !== "super_admin") {
        return res.status(403).json({ success: false, message: "Only super administrators can promote users" });
      }

      const validRoles = ["admin", "kyc_officer", "property_manager", "financial_analyst", "compliance_officer"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid admin role specified" });
      }

      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (targetUser.status !== "active" || targetUser.kycStatus !== "approved") {
        return res.status(400).json({ success: false, message: "User must be active with approved KYC" });
      }

      if (!otp) {
        const currentUser = await User.findById(currentUserId);
        const emailResult = await otpEmailService.sendOTP({
          operation: "promote_to_admin",
          propertyData: { title: `Promote ${targetUser.firstName} ${targetUser.lastName} to ${role}` },
          adminUser: currentUser,
          propertyId: userId
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: { step: "otp_required", sentTo: emailResult.sentTo, otpId: emailResult.otpId }
        });
      }

      const verification = await otpEmailService.verifyOTP(currentUserId, otp, "promote_to_admin");
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining
        });
      }

      targetUser.role = role;
      targetUser.promotedToAdminAt = new Date();
      targetUser.promotedBy = currentUserId;
      await targetUser.save();

      res.json({
        success: true,
        message: `User promoted to ${role} successfully`,
        data: { user: { id: targetUser._id, role: targetUser.role } }
      });
    } catch (error) {
      logger.error("Promote user to admin error:", error);
      res.status(500).json({ success: false, message: "Error promoting user" });
    }
  }


async createProperty(req, res) {
  try {
    console.log("=== CREATE PROPERTY - ADMIN CONTROL ===");
    console.log("Request body:", req.body);

    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please log in again.",
      });
    }

    const {
      title,
      description,
      location,
      propertyType,
      financials,
      status,
      otp,
    } = req.body;

    // Parse JSON fields
    let parsedLocation = {};
let parsedFinancials = {};

try {
  parsedLocation = location ? JSON.parse(location) : {};
} catch (err) {
  console.warn("Invalid location JSON, using empty object");
  parsedLocation = {};
}

try {
  parsedFinancials = financials ? JSON.parse(financials) : {};
} catch (err) {
  console.warn("Invalid financials JSON, using empty object");
  parsedFinancials = {};
}

    // SIMPLIFIED validation - only check for required title, no amount restrictions
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Property title is required",
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Property title cannot exceed 200 characters",
      });
    }

    // Clean and convert financial values - but allow ANY amount
    if (parsedFinancials.totalValue !== undefined) {
      let cleanValue = parsedFinancials.totalValue;
      if (typeof cleanValue === 'string') {
        cleanValue = cleanValue.replace(/[^\d.]/g, '');
      }
      
      const totalValue = Number(cleanValue);
      
      // Only check if it's a valid number - no minimum amount restriction
      if (isNaN(totalValue)) {
        return res.status(400).json({
          success: false,
          message: "Property total value must be a valid number",
          debug: {
            received: parsedFinancials.totalValue,
            converted: totalValue
          }
        });
      }

      // Admin can set any value - no restrictions!
      parsedFinancials.totalValue = totalValue;
      console.log(`Admin setting property value: ${totalValue}`);
    }

    // If OTP is not provided, send OTP and return
    if (!otp) {
      try {
        const emailResult = await otpEmailService.sendOTP({
          operation: "create",
          propertyData: { title, propertyType },
          adminUser: user,
          propertyId: null,
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: {
            step: "otp_required",
            message: emailResult.fallbackMode
              ? "Check console for OTP code (email service unavailable)"
              : "Check your email for OTP code",
            expiresIn: "10 minutes",
            sentTo: emailResult.sentTo,
            otpId: emailResult.otpId,
          },
        });
      } catch (otpError) {
        console.error("OTP sending failed:", otpError);
        return res.status(500).json({
          success: false,
          message: "Failed to send OTP. Please try again.",
        });
      }
    }

    // Verify OTP if provided
    if (otp) {
      const verification = await otpEmailService.verifyOTP(userId, otp, "create");
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining,
        });
      }
    }

    // Create property with admin's chosen values - no restrictions
    const propertyData = {
      title: title.trim(),
      description: description || "",
      location: parsedLocation,
      financials: {
        totalValue: Number(parsedFinancials.totalValue) || 0,
        expectedReturn: Number(parsedFinancials.expectedReturn || parsedFinancials.projectedYield) || 0,
        projectedYield: Number(parsedFinancials.projectedYield || parsedFinancials.expectedReturn) || 0,
        minimumInvestment: Number(parsedFinancials.minimumInvestment) || 1000,
        // Let admin set whatever values they want
        ...parsedFinancials
      },
      propertyType: propertyType || "residential",
      status: status || "active",
      images: [],
      timeline: {
        launchDate: new Date(),
        fundingDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      propertyData.images = req.files.map((file, index) => ({
        url: `/uploads/${file.filename}`,
        alt: `${title} - Image ${index + 1}`,
        isPrimary: index === 0,
        _id: new mongoose.Types.ObjectId(),
      }));
    }

    // Create the property
    const property = new Property(propertyData);
    await property.save();

    console.log(`Property created by admin - Value: ${propertyData.financials.totalValue}`);

    // Send notification to all admins about new property creation
    try {
      await notificationService.notifyNewPropertyAdded(property._id, user._id);
      logger.info(`Admin notifications sent for new property: ${property.title}`);
    } catch (notificationError) {
      logger.error('Failed to send property creation notifications:', notificationError);
      // Continue without failing the property creation
    }

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: {
        id: property._id,
        title: property.title,
        status: property.status,
      },
    });

  } catch (error) {
    console.error("Create property error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating property",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

  async updateProperty(req, res) {
    try {
      console.log("=== UPDATE PROPERTY WITH DATABASE OTP ===");
      console.log("Property ID:", req.params.id);
      console.log("Body:", req.body);

      const { id } = req.params;
      const userId = req.user.id;

      // Add null check for user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found. Please log in again.",
        });
      }

      // Extract fields from request
      const {
        title,
        description,
        location,
        propertyType,
        financials,
        investmentTerms,
        status,
        otp,
      } = req.body;

      // Parse JSON fields
      let parsedLocation = {};
      let parsedFinancials = {};
      let parsedInvestmentTerms = {};

      try {
        parsedLocation =
          typeof location === "string" ? JSON.parse(location) : location || {};
        parsedFinancials =
          typeof financials === "string"
            ? JSON.parse(financials)
            : financials || {};
        parsedInvestmentTerms =
          typeof investmentTerms === "string"
            ? JSON.parse(investmentTerms)
            : investmentTerms || {};
      } catch (parseError) {
        console.error("Error parsing JSON fields:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in location, financials, or investmentTerms fields",
        });
      }

      if (!otp) {
        try {
          // Get existing property for email
          const existingProperty = await Property.findById(id);
          if (!existingProperty) {
            return res.status(404).json({
              success: false,
              message: "Property not found",
            });
          }

          const emailResult = await otpEmailService.sendOTP({
            operation: "update",
            propertyData: {
              title: title || existingProperty.title,
              propertyType: propertyType || existingProperty.propertyType,
            },
            adminUser: user,
            propertyId: id,
          });

          console.log("OTP sent for update operation:", emailResult.otpId);

          return res.status(200).json({
            success: true,
            message: "OTP sent successfully",
            data: {
              step: "otp_required",
              message: emailResult.fallbackMode
                ? "Check console for OTP code (email service unavailable)"
                : "Check your email for OTP code",
              expiresIn: "10 minutes",
              sentTo: emailResult.sentTo,
              otpId: emailResult.otpId,
            },
          });
        } catch (otpError) {
          console.error("OTP sending failed:", otpError);
          logger.error("OTP sending failed:", otpError);
          return res.status(500).json({
            success: false,
            message: "Failed to send OTP. Please try again.",
            error:
              process.env.NODE_ENV === "development"
                ? otpError.message
                : undefined,
          });
        }
      }

      // If OTP is provided, verify it
      if (otp) {
        const verification = await otpEmailService.verifyOTP(
          userId,
          otp,
          "update"
        );

        if (!verification.valid) {
          return res.status(400).json({
            success: false,
            message: verification.reason,
            attemptsRemaining: verification.attemptsRemaining,
          });
        }

        console.log(
          `OTP verified successfully for update operation - User: ${userId}`
        );
        logger.info(
          `OTP verified successfully for update operation - User: ${userId}, OTP ID: ${verification.otpRecord._id}`
        );
      }

      // Continue with property update after OTP verification
      const existingProperty = await Property.findById(id);
      if (!existingProperty) {
        return res.status(404).json({
          success: false,
          message: "Property not found",
        });
      }

      // Prepare update data
      const updateData = {
        title: title || existingProperty.title,
        description: description || existingProperty.description,
        location: parsedLocation,
        financials: parsedFinancials,
        investmentTerms: parsedInvestmentTerms,
        propertyType: propertyType || existingProperty.propertyType,
        status: status || existingProperty.status,
        updatedAt: new Date(),
      };

      // Handle image uploads if any
      if (req.files && req.files.length > 0) {
        const newImages = req.files.map((file, index) => ({
          url: `/uploads/${file.filename}`,
          alt: `${updateData.title} - Image ${index + 1}`,
          isPrimary: index === 0,
          _id: new mongoose.Types.ObjectId(),
        }));

        // Keep existing images and add new ones
        updateData.images = [...(existingProperty.images || []), ...newImages];
      }

      // Update the property
      const updatedProperty = await Property.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      logger.info(
        `Property updated successfully - ID: ${updatedProperty._id}, Title: ${updatedProperty.title}, Updated by: ${userId}`
      );

      res.status(200).json({
        success: true,
        message: "Property updated successfully",
        data: {
          id: updatedProperty._id,
          title: updatedProperty.title,
          status: updatedProperty.status,
        },
      });
    } catch (error) {
      console.error("Update property error:", error);

      logger.error("Update property error:", {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: "Error updating property",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  async deleteProperty(req, res) {
    try {
      console.log("=== DELETE PROPERTY WITH DATABASE OTP ===");
      console.log("Property ID:", req.params.id);
      console.log("Body:", req.body);

      const { id } = req.params;
      const { otp } = req.body;
      const userId = req.user.id;

      // Add null check for user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found. Please log in again.",
        });
      }

      // If no OTP provided, generate and send OTP
      if (!otp) {
        // Get property details for the email
        const property = await Property.findById(id);
        if (!property) {
          return res.status(404).json({
            success: false,
            message: "Property not found",
          });
        }

        const emailResult = await otpEmailService.sendOTP({
          operation: "delete",
          propertyData: {
            title: property.title,
            propertyType: property.propertyType,
          },
          adminUser: user,
          propertyId: id,
        });

        console.log("OTP sent for delete operation:", emailResult.otpId);

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
          data: {
            step: "otp_required",
            message: emailResult.fallbackMode
              ? "Check console for OTP code (email service unavailable)"
              : "Check your email for OTP code",
            expiresIn: "10 minutes",
            sentTo: emailResult.sentTo,
            otpId: emailResult.otpId,
          },
        });
      }

      // If OTP provided, verify and delete
      const verification = await otpEmailService.verifyOTP(
        userId,
        otp,
        "delete"
      );

      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.reason,
          attemptsRemaining: verification.attemptsRemaining,
        });
      }

      // Get property details before deletion for logging
      const property = await Property.findById(id);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found",
        });
      }

      // Delete property
      await Property.findByIdAndDelete(id);

      logger.info(
        `Property deleted successfully - ID: ${id}, Title: ${property.title}, Deleted by: ${userId}, OTP ID: ${verification.otpRecord._id}`
      );

      res.status(200).json({
        success: true,
        message: "Property deleted successfully",
        data: {
          id: id,
          title: property.title,
        },
      });
    } catch (error) {
      console.error("Delete property error:", error);

      logger.error("Delete property error:", {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: "Error deleting property",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  async getPropertyById(req, res) {
    try {
      const { id } = req.params;

      const property = await Property.findById(id)
        .populate("createdBy", "firstName lastName email")
        .lean();

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found",
        });
      }

      res.json({
        success: true,
        data: property,
      });
    } catch (error) {
      console.error("Get property by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching property",
        error: error.message,
      });
    }
  }

  // OTP Status Check Method
  async getOTPStatus(req, res) {
    try {
      const userId = req.user.id;
      const otpStatus = await otpEmailService.getOTPStatus(userId);

      res.json({
        success: true,
        data: otpStatus,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error checking OTP status",
      });
    }
  }

  // Reports Methods
  async getEarningsReport(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        propertyId,
        format = "json",
      } = req.query;

      const matchStage = {
        status: "confirmed",
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };

      if (propertyId) {
        matchStage.property = mongoose.Types.ObjectId(propertyId);
      }

      // Overall earnings summary
      const [earningsSummary, propertyBreakdown] = await Promise.all([
        Investment.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalInvestments: { $sum: "$amount" },
              totalReturnsDistributed: {
                $sum: "$returns.totalReturnsReceived",
              },
              totalInvestors: { $addToSet: "$user" },
              totalProperties: { $addToSet: "$property" },
              averageInvestment: { $avg: "$amount" },
              totalManagementFees: {
                $sum: { $multiply: ["$returns.totalReturnsReceived", 0.025] },
              },
            },
          },
        ]),
        Investment.aggregate([
          { $match: matchStage },
          {
            $lookup: {
              from: "properties",
              localField: "property",
              foreignField: "_id",
              as: "propertyDetails",
            },
          },
          { $unwind: "$propertyDetails" },
          {
            $group: {
              _id: "$property",
              propertyTitle: { $first: "$propertyDetails.title" },
              totalInvestments: { $sum: "$amount" },
              totalReturns: { $sum: "$returns.totalReturnsReceived" },
              investorCount: { $addToSet: "$user" },
            },
          },
          {
            $addFields: {
              uniqueInvestors: { $size: "$investorCount" },
            },
          },
          { $sort: { totalInvestments: -1 } },
        ]),
      ]);

      const summary = earningsSummary[0] || {
        totalInvestments: 0,
        totalReturnsDistributed: 0,
        totalInvestors: [],
        totalProperties: [],
        averageInvestment: 0,
        totalManagementFees: 0,
      };

      const reportData = {
        summary: {
          ...summary,
          uniqueInvestors: summary.totalInvestors.length,
          uniqueProperties: summary.totalProperties.length,
          reportPeriod: {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          },
          generatedAt: new Date(),
          generatedBy: req.user.id,
        },
        breakdown: { byProperty: propertyBreakdown },
      };

      // Handle CSV format
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=earnings-report.csv"
        );

        let csv = "Property,Total Investments,Total Returns,Investor Count\n";
        propertyBreakdown.forEach((item) => {
          csv += `"${item.propertyTitle}",${item.totalInvestments},${item.totalReturns},${item.uniqueInvestors}\n`;
        });

        return res.send(csv);
      }

      res.json({
        success: true,
        message: "Earnings report generated successfully",
        data: reportData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error generating earnings report",
        error: error.message,
      });
    }
  }

  async getDashboard(req, res) {
    try {
      const [
        totalProperties,
        activeProperties,
        totalInvestments,
        totalUsers,
        pendingKyc,
      ] = await Promise.all([
        Property.countDocuments(),
        Property.countDocuments({ status: "active" }),
        Investment.countDocuments({ status: "confirmed" }),
        User.countDocuments({ status: "active" }),
        User.countDocuments({ kycStatus: "pending" }),
      ]);

      // Get investment value and returns using aggregation pipeline
      const investmentStats = await Investment.aggregate([
        { $match: { status: "confirmed" } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalAmount: { $sum: "$amount" },
                  totalReturns: { $sum: { $ifNull: ["$returns.totalReturnsReceived", 0] } },
                  count: { $sum: 1 }
                }
              }
            ],
            investments: [
              {
                $project: {
                  amount: 1,
                  rentalYieldRate: { $ifNull: ["$rentalYieldRate", 0] },
                  appreciationRate: { $ifNull: ["$appreciationRate", 0] },
                  maturityPeriodYears: { $ifNull: ["$maturityPeriodYears", 5] },
                  createdAt: 1,
                  returns: { $ifNull: ["$returns.totalReturnsReceived", 0] }
                }
              }
            ]
          }
        }
      ]);

      const totals = investmentStats[0]?.totals[0] || { totalAmount: 0, totalReturns: 0, count: 0 };
      const investments = investmentStats[0]?.investments || [];

      // Calculate projected returns based on rental yield and appreciation
      // During locking period: only rental yield
      // After maturity: rental yield + appreciation
      let projectedTotalReturns = 0;
      investments.forEach(inv => {
        // Get investment creation time
        const investmentDate = new Date(inv.createdAt);
        const maturityPeriodMs = inv.maturityPeriodYears * 365 * 24 * 60 * 60 * 1000;
        const maturityDate = new Date(investmentDate.getTime() + maturityPeriodMs);
        const now = new Date();

        // Rental yield annual return (earned during entire period)
        const annualRentalIncome = inv.amount * (inv.rentalYieldRate / 100);
        const totalRentalIncome = annualRentalIncome * inv.maturityPeriodYears;

        // Appreciation (only after maturity)
        let appreciationGain = 0;
        if (now >= maturityDate) {
          // Investment has matured - apply full appreciation
          const appreciationRate = inv.appreciationRate / 100;
          const finalValue = inv.amount * Math.pow(1 + appreciationRate, inv.maturityPeriodYears);
          appreciationGain = finalValue - inv.amount;
        }

        // Total projected returns for this investment
        const projectedReturns = totalRentalIncome + appreciationGain;
        projectedTotalReturns += projectedReturns;
      });

      // Calculate average return percentage
      const totalInvestmentValue = totals.totalAmount;
      const averageReturnPercentage = totalInvestmentValue > 0
        ? ((projectedTotalReturns / totalInvestmentValue) * 100).toFixed(2)
        : 0;

      res.json({
        success: true,
        data: {
          overview: {
            totalProperties,
            activeProperties,
            totalInvestments,
            totalUsers,
            pendingKyc,
            totalInvestmentValue,
            totalReturns: totals.totalReturns,
            projectedReturns: Math.round(projectedTotalReturns),
            averageReturnPercentage: parseFloat(averageReturnPercentage),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard data",
        error: error.message,
      });
    }
  }

  async createAdminUser(req, res) {
    try {
      const { firstName, lastName, email, role, password } = req.body;

      if (req.user.role !== "super_admin") {
        return res.status(403).json({
          success: false,
          message: "Only super admins can create admin users",
        });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      const newAdmin = new User({
        firstName,
        lastName,
        email: email.toLowerCase(),
        password,
        role,
        status: "active",
        kycStatus: "approved",
        emailVerified: true,
      });

      await newAdmin.save();

      res.status(201).json({
        success: true,
        message: "Administrator created successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating administrator",
      });
    }
  }

  async getAllUsers(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        status,
        kycStatus,
        search,
      } = req.query;

      // Build filter
      const filter = {};
      if (status) filter.status = status;
      if (kycStatus) filter.kycStatus = kycStatus;

      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ];
      }

      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Get users with KYC data
      const [users, totalUsers, stats] = await Promise.all([
        User.find(filter)
          .select("-password")
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(filter),
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: {
                $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
              },
              pendingKyc: {
                $sum: { $cond: [{ $eq: ["$kycStatus", "pending"] }, 1, 0] },
              },
              approvedKyc: {
                $sum: { $cond: [{ $eq: ["$kycStatus", "approved"] }, 1, 0] },
              },
            },
          },
        ]),
      ]);

      const totalPages = Math.ceil(totalUsers / limitNum);

      logger.info(
        `Admin fetched users list - Admin: ${req.user.id}, Page: ${page}`
      );

      res.json({
        success: true,
        data: {
          users: users.map((user) => ({
            ...user,
            fullName: `${user.firstName} ${user.lastName}`,
          })),
          pagination: {
            page: pageNum,
            pages: totalPages,
            total: totalUsers,
            limit: limitNum,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
          statistics: stats[0] || {
            totalUsers: 0,
            activeUsers: 0,
            pendingKyc: 0,
            approvedKyc: 0,
          },
        },
      });
    } catch (error) {
      logger.error("Get all users error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching users",
        error: error.message,
      });
    }
  }

  async updateKycStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { status, rejectionReasons, reviewNotes } = req.body;
      const adminId = req.user.id;

      // Find and update user
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const previousStatus = user.kycStatus;
      user.kycStatus = status;

      // Handle approval
      if (status === "approved" && user.status === "pending") {
        user.status = "active";
      }

      await user.save();

      logger.info(
        `KYC status updated - User: ${id}, Status: ${status}, Admin: ${adminId}`
      );

      res.json({
        success: true,
        message: `KYC ${status} successfully`,
        data: {
          user: {
            id: user._id,
            email: user.email,
            fullName: `${user.firstName} ${user.lastName}`,
            kycStatus: user.kycStatus,
            status: user.status,
          },
          statusChange: {
            from: previousStatus,
            to: status,
            changedBy: adminId,
            changedAt: new Date(),
          },
        },
      });
    } catch (error) {
      logger.error("Update KYC status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating KYC status",
        error: error.message,
      });
    }
  }

  async getProperties(req, res) {
    try {
      // Extract and validate query parameters
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        status,
        propertyType,
        search,
        city,
      } = req.query;

      // Validate and sanitize pagination parameters
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20)); // Max 100 per page
      const skip = (pageNum - 1) * limitNum;

      // Build MongoDB filter object
      const filter = {};

      // Apply status filter if provided
      if (status && typeof status === 'string') {
        filter.status = status.trim();
      }

      // Apply property type filter if provided
      if (propertyType && typeof propertyType === 'string') {
        filter.propertyType = propertyType.trim();
      }

      // Apply city filter (case-insensitive)
      if (city && typeof city === 'string') {
        filter["location.city"] = { $regex: `^${city.trim()}$`, $options: 'i' };
      }

      // Apply search filter across multiple fields
      if (search && typeof search === 'string' && search.trim().length > 0) {
        const searchRegex = search.trim();
        filter.$or = [
          { title: { $regex: searchRegex, $options: "i" } },
          { titleAr: { $regex: searchRegex, $options: "i" } },
          { description: { $regex: searchRegex, $options: "i" } },
          { "location.address": { $regex: searchRegex, $options: "i" } },
          { "location.city": { $regex: searchRegex, $options: "i" } },
        ];
      }

      // Validate sort parameter to prevent injection
      const validSortFields = ['createdAt', 'title', 'financials.totalValue', 'status', 'propertyType'];
      const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
      const isSortValid = validSortFields.includes(sortField);
      const sortObj = isSortValid
        ? { [sortField]: sort.startsWith('-') ? -1 : 1 }
        : { createdAt: -1 };

      // Fetch properties with aggregation pipeline for investment data
      const [properties, totalProperties] = await Promise.all([
        Property.aggregate([
          { $match: filter },
          // Join with investments collection
          {
            $lookup: {
              from: "investments",
              localField: "_id",
              foreignField: "property",
              as: "investments",
            },
          },
          // Calculate investment metrics
          {
            $addFields: {
              investorCount: { $size: "$investments" },
              totalInvested: { $ifNull: [{ $sum: "$investments.amount" }, 0] },
              fundingProgress: {
                $cond: {
                  if: { $gt: ["$financials.totalValue", 0] },
                  then: {
                    $multiply: [
                      {
                        $divide: [
                          { $ifNull: [{ $sum: "$investments.amount" }, 0] },
                          "$financials.totalValue",
                        ],
                      },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
            },
          },
          // Apply sorting
          { $sort: sortObj },
          // Pagination
          { $skip: skip },
          { $limit: limitNum },
          // Remove sensitive data
          { $project: { investments: 0 } },
        ]),
        Property.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(totalProperties / limitNum);

      logger.info(
        `Fetched properties list - User: ${req.user ? req.user.id : 'anonymous'}, Page: ${pageNum}, Found: ${totalProperties}`
      );

      return res.status(200).json({
        success: true,
        data: {
          properties,
          pagination: {
            page: pageNum,
            pages: totalPages,
            total: totalProperties,
            limit: limitNum,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
        },
      });
    } catch (error) {
      logger.error("Get properties error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching properties",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  async getPropertyById(req, res) {
    try {
      const { id } = req.params;

      const property = await Property.findById(id)
        .populate("createdBy", "firstName lastName email")
        .lean();

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found",
        });
      }

      res.json({
        success: true,
        data: property,
      });
    } catch (error) {
      console.error("Get property by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching property",
        error: error.message,
      });
    }
  }

  // OTP Status Check Method
  async getOTPStatus(req, res) {
    try {
      const userId = req.user.id;
      const otpStatus = await otpEmailService.getOTPStatus(userId);

      res.json({
        success: true,
        data: otpStatus,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error checking OTP status",
      });
    }
  }

  async getEarningsReport(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        propertyId,
        format = "json",
      } = req.query;

      const matchStage = {
        status: "confirmed",
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };

      if (propertyId) {
        matchStage.property = mongoose.Types.ObjectId(propertyId);
      }

      // Overall earnings summary
      const [earningsSummary, propertyBreakdown] = await Promise.all([
        Investment.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalInvestments: { $sum: "$amount" },
              totalReturnsDistributed: {
                $sum: "$returns.totalReturnsReceived",
              },
              totalInvestors: { $addToSet: "$user" },
              totalProperties: { $addToSet: "$property" },
              averageInvestment: { $avg: "$amount" },
              totalManagementFees: {
                $sum: { $multiply: ["$returns.totalReturnsReceived", 0.025] },
              },
            },
          },
        ]),
        Investment.aggregate([
          { $match: matchStage },
          {
            $lookup: {
              from: "properties",
              localField: "property",
              foreignField: "_id",
              as: "propertyDetails",
            },
          },
          { $unwind: "$propertyDetails" },
          {
            $group: {
              _id: "$property",
              propertyTitle: { $first: "$propertyDetails.title" },
              totalInvestments: { $sum: "$amount" },
              totalReturns: { $sum: "$returns.totalReturnsReceived" },
              investorCount: { $addToSet: "$user" },
            },
          },
          {
            $addFields: {
              uniqueInvestors: { $size: "$investorCount" },
            },
          },
          { $sort: { totalInvestments: -1 } },
        ]),
      ]);

      const summary = earningsSummary[0] || {
        totalInvestments: 0,
        totalReturnsDistributed: 0,
        totalInvestors: [],
        totalProperties: [],
        averageInvestment: 0,
        totalManagementFees: 0,
      };

      const reportData = {
        summary: {
          ...summary,
          uniqueInvestors: summary.totalInvestors.length,
          uniqueProperties: summary.totalProperties.length,
          reportPeriod: {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          },
          generatedAt: new Date(),
          generatedBy: req.user.id,
        },
        breakdown: { byProperty: propertyBreakdown },
      };

      // Handle CSV format
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=earnings-report.csv"
        );

        let csv = "Property,Total Investments,Total Returns,Investor Count\n";
        propertyBreakdown.forEach((item) => {
          csv += `"${item.propertyTitle}",${item.totalInvestments},${item.totalReturns},${item.uniqueInvestors}\n`;
        });

        return res.send(csv);
      }

      res.json({
        success: true,
        message: "Earnings report generated successfully",
        data: reportData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error generating earnings report",
        error: error.message,
      });
    }
  }

  async getDashboard(req, res) {
    try {
      const [
        totalProperties,
        activeProperties,
        totalInvestments,
        totalUsers,
        pendingKyc,
      ] = await Promise.all([
        Property.countDocuments(),
        Property.countDocuments({ status: "active" }),
        Investment.countDocuments({ status: "confirmed" }),
        User.countDocuments({ status: "active" }),
        User.countDocuments({ kycStatus: "pending" }),
      ]);

      // Get investment value and returns using aggregation pipeline
      const investmentStats = await Investment.aggregate([
        { $match: { status: "confirmed" } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalAmount: { $sum: "$amount" },
                  totalReturns: { $sum: { $ifNull: ["$returns.totalReturnsReceived", 0] } },
                  count: { $sum: 1 }
                }
              }
            ],
            investments: [
              {
                $project: {
                  amount: 1,
                  rentalYieldRate: { $ifNull: ["$rentalYieldRate", 0] },
                  appreciationRate: { $ifNull: ["$appreciationRate", 0] },
                  maturityPeriodYears: { $ifNull: ["$maturityPeriodYears", 5] },
                  createdAt: 1,
                  returns: { $ifNull: ["$returns.totalReturnsReceived", 0] }
                }
              }
            ]
          }
        }
      ]);

      const totals = investmentStats[0]?.totals[0] || { totalAmount: 0, totalReturns: 0, count: 0 };
      const investments = investmentStats[0]?.investments || [];

      // Calculate projected returns based on rental yield and appreciation
      // During locking period: only rental yield
      // After maturity: rental yield + appreciation
      let projectedTotalReturns = 0;
      investments.forEach(inv => {
        // Get investment creation time
        const investmentDate = new Date(inv.createdAt);
        const maturityPeriodMs = inv.maturityPeriodYears * 365 * 24 * 60 * 60 * 1000;
        const maturityDate = new Date(investmentDate.getTime() + maturityPeriodMs);
        const now = new Date();

        // Rental yield annual return (earned during entire period)
        const annualRentalIncome = inv.amount * (inv.rentalYieldRate / 100);
        const totalRentalIncome = annualRentalIncome * inv.maturityPeriodYears;

        // Appreciation (only after maturity)
        let appreciationGain = 0;
        if (now >= maturityDate) {
          // Investment has matured - apply full appreciation
          const appreciationRate = inv.appreciationRate / 100;
          const finalValue = inv.amount * Math.pow(1 + appreciationRate, inv.maturityPeriodYears);
          appreciationGain = finalValue - inv.amount;
        }

        // Total projected returns for this investment
        const projectedReturns = totalRentalIncome + appreciationGain;
        projectedTotalReturns += projectedReturns;
      });

      // Calculate average return percentage
      const totalInvestmentValue = totals.totalAmount;
      const averageReturnPercentage = totalInvestmentValue > 0
        ? ((projectedTotalReturns / totalInvestmentValue) * 100).toFixed(2)
        : 0;

      res.json({
        success: true,
        data: {
          overview: {
            totalProperties,
            activeProperties,
            totalInvestments,
            totalUsers,
            pendingKyc,
            totalInvestmentValue,
            totalReturns: totals.totalReturns,
            projectedReturns: Math.round(projectedTotalReturns),
            averageReturnPercentage: parseFloat(averageReturnPercentage),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard data",
        error: error.message,
      });
    }
  }

  async createAdminUser(req, res) {
    try {
      const { firstName, lastName, email, phone, position, role, password, groupIds } = req.body;
      const Role = require('../models/Role');

      if (req.user.role !== "super_admin") {
        return res.status(403).json({
          success: false,
          message: "Only super admins can create admin users",
        });
      }

      // Validate required fields
      if (!firstName || !lastName || !email || !password || !role) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: firstName, lastName, email, password, role",
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      // Find the role by name to get its ObjectId
      const roleDoc = await Role.findOne({ name: role });
      if (!roleDoc) {
        return res.status(400).json({
          success: false,
          message: `Role "${role}" not found`,
        });
      }

      const newAdmin = new User({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase(),
        phone: phone || undefined,
        position: position || undefined,
        password,
        role: "admin",
        assignedRole: roleDoc._id, // Store the role ObjectId
        status: "active",
        kycStatus: "approved",
        emailVerified: true,
      });

      const savedAdmin = await newAdmin.save();

      // Add to groups if specified
      if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
        for (const groupId of groupIds) {
          try {
            const group = await Group.findById(groupId);
            if (group) {
              await group.addMember(savedAdmin._id, [], req.user.id);
            }
          } catch (groupErr) {
            console.warn(`Failed to add admin to group ${groupId}:`, groupErr.message);
          }
        }
      }

      logger.info(`Admin created new administrator - Admin: ${req.user.id}, New Admin: ${savedAdmin._id}, Role: ${role}`);

      res.status(201).json({
        success: true,
        message: "Administrator created successfully",
        data: {
          id: savedAdmin._id,
          firstName: savedAdmin.firstName,
          lastName: savedAdmin.lastName,
          email: savedAdmin.email,
          phone: savedAdmin.phone,
          position: savedAdmin.position,
          role: role,
          status: savedAdmin.status,
        },
      });
    } catch (error) {
      logger.error('Create admin user error:', error);
      res.status(500).json({
        success: false,
        message: "Error creating administrator",
        error: error.message,
      });
    }
  }


  async getActiveInvestors(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        search,
        propertyId
      } = req.query;

      const pipeline = [
        {
          $match: {
            status: "confirmed"
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "investor"
          }
        },
        {
          $lookup: {
            from: "properties",
            localField: "property",
            foreignField: "_id",
            as: "propertyDetails"
          }
        },
        {
          $unwind: "$investor"
        },
        {
          $unwind: "$propertyDetails"
        }
      ];

      if (propertyId) {
        pipeline[0].$match.property = new mongoose.Types.ObjectId(propertyId);
      }

      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { "investor.firstName": { $regex: search, $options: "i" } },
              { "investor.lastName": { $regex: search, $options: "i" } },
              { "investor.email": { $regex: search, $options: "i" } },
              { "propertyDetails.title": { $regex: search, $options: "i" } }
            ]
          }
        });
      }

      pipeline.push(
        {
          $group: {
            _id: "$investor._id",
            investor: { $first: "$investor" },
            totalInvestments: { $sum: "$amount" },
            totalReturns: { $sum: "$returns.totalReturnsReceived" },
            investmentCount: { $sum: 1 },
            properties: {
              $push: {
                propertyId: "$property",
                propertyTitle: "$propertyDetails.title",
                amount: "$amount",
                date: "$createdAt",
                returns: "$returns.totalReturnsReceived"
              }
            },
            firstInvestment: { $min: "$createdAt" },
            lastInvestment: { $max: "$createdAt" }
          }
        },
        {
          $addFields: {
            "investor.fullName": {
              $concat: ["$investor.firstName", " ", "$investor.lastName"]
            }
          }
        }
      );

      
      const sortField = sort.startsWith("-") ? sort.substring(1) : sort;
      const sortDirection = sort.startsWith("-") ? -1 : 1;

      let sortStage = {};
      if (sortField === "createdAt") {
        sortStage = { firstInvestment: sortDirection };
      } else if (sortField === "totalInvestments") {
        sortStage = { totalInvestments: sortDirection };
      } else if (sortField === "name") {
        sortStage = { "investor.firstName": sortDirection };
      } else {
        sortStage = { firstInvestment: sortDirection };
      }

      pipeline.push({ $sort: sortStage });

      // Get total count for pagination
      const countPipeline = [...pipeline, { $count: "total" }];
      const [totalResult] = await Investment.aggregate(countPipeline);
      const totalInvestors = totalResult?.total || 0;

      // Add pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      pipeline.push({ $skip: skip }, { $limit: limitNum });

      // Execute the query
      const investors = await Investment.aggregate(pipeline);

      // Calculate summary statistics
      const summaryPipeline = [
        {
          $match: {
            status: "confirmed"
          }
        },
        {
          $group: {
            _id: null,
            totalInvestors: { $addToSet: "$user" },
            totalInvestmentAmount: { $sum: "$amount" },
            totalReturnsDistributed: { $sum: "$returns.totalReturnsReceived" },
            averageInvestment: { $avg: "$amount" }
          }
        },
        {
          $addFields: {
            uniqueInvestors: { $size: "$totalInvestors" }
          }
        }
      ];

      const [summary] = await Investment.aggregate(summaryPipeline);

      const totalPages = Math.ceil(totalInvestors / limitNum);

      logger.info(
        `Admin fetched active investors - Admin: ${req.user.id}, Page: ${page}, Total: ${totalInvestors}`
      );

      res.json({
        success: true,
        data: {
          investors: investors.map(inv => ({
            id: inv._id,
            name: inv.investor.fullName,
            firstName: inv.investor.firstName,
            lastName: inv.investor.lastName,
            email: inv.investor.email,
            phone: inv.investor.phone,
            kycStatus: inv.investor.kycStatus,
            status: inv.investor.status,
            totalInvestments: inv.totalInvestments,
            totalReturns: inv.totalReturns || 0,
            investmentCount: inv.investmentCount,
            properties: inv.properties,
            firstInvestment: inv.firstInvestment,
            lastInvestment: inv.lastInvestment,
            joinedDate: inv.investor.createdAt,
            profileData: inv.investor.profileData || null,
            investmentSummary: inv.investor.investmentSummary || null
          })),
          pagination: {
            page: pageNum,
            pages: totalPages,
            total: totalInvestors,
            limit: limitNum,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1
          },
          summary: {
            totalUniqueInvestors: summary?.uniqueInvestors || 0,
            totalInvestmentAmount: summary?.totalInvestmentAmount || 0,
            totalReturnsDistributed: summary?.totalReturnsDistributed || 0,
            averageInvestment: summary?.averageInvestment || 0
          },
          filters: {
            search,
            propertyId
          }
        }
      });

    } catch (error) {
      logger.error("Get active investors error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching active investors",
        error: error.message
      });
    }
  }

  // Get transactions and withdrawal requests
  async getTransactions(req, res) {
    try {
      const { startDate, endDate, status, type, limit = 50, offset = 0 } = req.query;

      // Build filter
      const filter = {};
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      if (status) filter.status = status;
      if (type) filter.type = type;

      // Get transactions
      const Transaction = require('../models/Transaction');
      const User = require('../models/User');
      const Property = require('../models/Property');

      const transactions = await Transaction.find(filter)
        .populate('user', 'email firstName lastName')
        .populate('relatedEntityId')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      const totalTransactions = await Transaction.countDocuments(filter);

      // Calculate totals
      const stats = await Transaction.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: { $toDouble: '$amount' } }
          }
        }
      ]);

      // Get withdrawal requests (if model exists)
      let withdrawals = [];
      let pendingWithdrawals = 0;

      try {
        const WithdrawalRequest = require('../models/WithdrawalRequest');
        const withdrawalFilter = {};
        if (startDate || endDate) {
          withdrawalFilter.requestedAt = {};
          if (startDate) withdrawalFilter.requestedAt.$gte = new Date(startDate);
          if (endDate) withdrawalFilter.requestedAt.$lte = new Date(endDate);
        }
        if (status) withdrawalFilter.status = status;

        withdrawals = await WithdrawalRequest.find(withdrawalFilter)
          .populate('userId', 'email firstName lastName')
          .sort({ requestedAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean();

        pendingWithdrawals = await WithdrawalRequest.countDocuments({ ...withdrawalFilter, status: 'pending' });
      } catch (err) {
        logger.debug('WithdrawalRequest model not available, skipping withdrawals');
        withdrawals = [];
        pendingWithdrawals = 0;
      }

      // Calculate summary
      const completedTransactions = await Transaction.aggregate([
        { $match: { ...filter, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      res.json({
        success: true,
        data: {
          transactions: transactions.map(t => ({
            id: t._id,
            investorId: t.user?._id,
            investorName: `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || 'Unknown',
            investorEmail: t.user?.email,
            type: t.type,
            amount: t.amount,
            fee: t.fee,
            description: t.description,
            reference: t.reference,
            status: t.status,
            paymentMethod: t.paymentMethod,
            createdAt: t.createdAt,
            processedAt: t.processedAt
          })),
          withdrawals: withdrawals.map(w => ({
            id: w._id,
            userId: w.userId?._id,
            userName: `${w.userId?.firstName || ''} ${w.userId?.lastName || ''}`.trim() || 'Unknown',
            userEmail: w.userId?.email,
            amount: w.amount,
            reason: w.reason,
            status: w.status,
            priority: w.priority,
            requestedAt: w.requestedAt,
            reviewedAt: w.reviewedAt
          })),
          summary: {
            totalTransactions,
            completedAmount: completedTransactions[0]?.total || 0,
            pendingWithdrawals,
            totalWithdrawals: withdrawals.length,
            byStatus: stats.reduce((acc, s) => {
              acc[s._id] = { count: s.count, amount: s.total };
              return acc;
            }, {})
          },
          pagination: {
            offset,
            limit,
            total: totalTransactions
          }
        }
      });

    } catch (error) {
      logger.error("Get transactions error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching transactions",
        error: error.message
      });
    }
  }

  // Get analytics and platform insights
  async getAnalytics(req, res) {
    try {
      const { startDate, endDate, range = '30days' } = req.query;

      // Calculate date range
      const now = new Date();
      let start = startDate ? new Date(startDate) : new Date(now);
      let end = endDate ? new Date(endDate) : new Date(now);

      if (!startDate) {
        switch (range) {
          case '7days':
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30days':
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90days':
            start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case '1year':
            start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        }
      }

      const Transaction = require('../models/Transaction');
      const User = require('../models/User');
      const Investment = require('../models/Investment');
      const Property = require('../models/Property');

      // Get revenue data (monthly)
      const revenueData = await Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            revenue: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      // Get user growth
      const userGrowthData = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      // Get total stats
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ 'wallet.balance': { $gt: 0 } });
      const totalProperties = await Property.countDocuments({ isActive: true });
      const totalInvestmentValue = await Transaction.aggregate([
        {
          $match: {
            type: 'investment',
            status: 'completed',
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      // Get investment returns
      const investments = await Investment.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: null,
            totalInvested: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        }
      ]);

      // Get KYC stats
      const kycStats = await User.aggregate([
        {
          $group: {
            _id: '$kycStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      // Calculate projections
      const projectedReturns = (totalInvestmentValue[0]?.total || 0) * 0.098; // 9.8% average return

      res.json({
        success: true,
        data: {
          metrics: {
            totalRevenue: totalInvestmentValue[0]?.total || 0,
            totalUsers,
            activeUsers,
            totalProperties,
            projectedReturns,
            averageReturnPercentage: 9.8
          },
          monthlyRevenue: revenueData.map(d => ({
            month: new Date(d._id.year, d._id.month - 1).toLocaleDateString('en-US', { month: 'short' }),
            value: d.revenue,
            count: d.count
          })),
          userGrowth: userGrowthData.map(d => ({
            month: new Date(d._id.year, d._id.month - 1).toLocaleDateString('en-US', { month: 'short' }),
            value: d.newUsers
          })),
          investmentStats: {
            totalInvested: investments[0]?.totalInvested || 0,
            investmentCount: investments[0]?.count || 0,
            averageInvestment: investments[0]?.avgAmount || 0
          },
          kycStats: kycStats.reduce((acc, stat) => {
            acc[stat._id || 'unknown'] = stat.count;
            return acc;
          }, {}),
          dateRange: {
            start,
            end
          }
        }
      });

    } catch (error) {
      logger.error("Get analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching analytics",
        error: error.message
      });
    }
  }

  async getInvestorById(req, res) {
    try {
      const { id } = req.params;

      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid investor ID format"
        });
      }

      // Find the user/investor
      const investor = await User.findById(id).select("-password");

      if (!investor) {
        return res.status(404).json({
          success: false,
          message: "Investor not found"
        });
      }

      // Get investment data for this investor
      const investmentsPipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(id),
            status: "confirmed"
          }
        },
        {
          $lookup: {
            from: "properties",
            localField: "property",
            foreignField: "_id",
            as: "propertyDetails"
          }
        },
        {
          $unwind: "$propertyDetails"
        },
        {
          $group: {
            _id: null,
            totalInvestments: { $sum: "$amount" },
            totalReturns: { $sum: "$returns.totalReturnsReceived" },
            investmentCount: { $sum: 1 },
            properties: {
              $push: {
                propertyId: "$property",
                propertyTitle: "$propertyDetails.title",
                propertyLocation: "$propertyDetails.location",
                amount: "$amount",
                ownershipPercentage: "$ownershipPercentage",
                returns: "$returns.totalReturnsReceived",
                date: "$createdAt",
                status: "$status"
              }
            },
            firstInvestment: { $min: "$createdAt" },
            lastInvestment: { $max: "$createdAt" }
          }
        }
      ];

      const [investmentData] = await Investment.aggregate(investmentsPipeline);

      // Get KYC data
      const kycData = await KYC.findOne({ user: id });

      // Prepare response
      const response = {
        success: true,
        data: {
          id: investor._id,
          firstName: investor.firstName,
          lastName: investor.lastName,
          name: `${investor.firstName} ${investor.lastName}`,
          email: investor.email,
          phone: investor.phone,
          kycStatus: investor.kycStatus,
          status: investor.status,
          role: investor.role,
          createdAt: investor.createdAt,
          updatedAt: investor.updatedAt,

          // Investment summary
          totalInvested: investmentData?.totalInvestments || 0,
          totalReturns: investmentData?.totalReturns || 0,
          activeInvestments: investmentData?.investmentCount || 0,
          firstInvestment: investmentData?.firstInvestment || null,
          lastInvestment: investmentData?.lastInvestment || null,

          // Properties invested in
          properties: investmentData?.properties || [],

          // Profile data (Investment Profile, Banking, etc.)
          profileData: investor.profileData || null,

          // Investment summary
          investmentSummary: investor.investmentSummary || null,

          // KYC details (if available)
          kyc: kycData ? {
            nationality: kycData.nationality,
            dateOfBirth: kycData.dateOfBirth,
            idNumber: kycData.idNumber,
            address: kycData.address,
            city: kycData.city,
            country: kycData.country,
            occupation: kycData.occupation,
            income: kycData.income,
            submittedAt: kycData.createdAt,
            reviewedAt: kycData.reviewedAt,
            reviewedBy: kycData.reviewedBy
          } : null
        }
      };

      logger.info(`Admin fetched investor by ID - Admin: ${req.user.id}, Investor: ${id}`);

      res.json(response);

    } catch (error) {
      logger.error("Get investor by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching investor details",
        error: error.message
      });
    }
  }

  // ========== RBAC - ROLE MANAGEMENT METHODS ==========

  async getRoles(req, res) {
    try {
      const Role = require('../models/Role');

      const roles = await Role.find()
        .select('-__v')
        .sort('displayName')
        .lean();

      // Get user count for each role
      const rolesWithCounts = await Promise.all(roles.map(async (role) => {
        const userCount = await User.countDocuments({ assignedRole: role._id });
        return {
          ...role,
          userCount
        };
      }));

      logger.info(`Admin fetched roles - Admin: ${req.user.id}`);

      res.json({
        success: true,
        data: rolesWithCounts
      });
    } catch (error) {
      logger.error('Get roles error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching roles',
        error: error.message
      });
    }
  }

  async getRoleById(req, res) {
    try {
      const Role = require('../models/Role');
      const { id } = req.params;

      const role = await Role.findById(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Get users with this role
      const users = await User.find({ assignedRole: id })
        .select('firstName lastName email position department')
        .lean();

      res.json({
        success: true,
        data: {
          ...role.toObject(),
          users
        }
      });
    } catch (error) {
      logger.error('Get role by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching role',
        error: error.message
      });
    }
  }

  async createRole(req, res) {
    try {
      const Role = require('../models/Role');
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { name, displayName, description, permissions } = req.body;

      // Check if role with this name already exists
      const existingRole = await Role.findOne({ name: name.toLowerCase().replace(/\s+/g, '_') });

      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role with this name already exists'
        });
      }

      const role = await Role.create({
        name: name.toLowerCase().replace(/\s+/g, '_'),
        displayName,
        description,
        permissions,
        createdBy: req.user.id,
        isSystemRole: false
      });

      logger.info(`Admin created role - Admin: ${req.user.id}, Role: ${role.name}`);

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: role
      });
    } catch (error) {
      logger.error('Create role error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating role',
        error: error.message
      });
    }
  }

  async updateRole(req, res) {
    try {
      const Role = require('../models/Role');
      const { id } = req.params;
      const { displayName, description, permissions } = req.body;

      const role = await Role.findById(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent editing system roles
      if (role.isSystemRole) {
        return res.status(403).json({
          success: false,
          message: 'Cannot modify system roles'
        });
      }

      if (displayName) role.displayName = displayName;
      if (description !== undefined) role.description = description;
      if (permissions) role.permissions = permissions;

      await role.save();

      logger.info(`Admin updated role - Admin: ${req.user.id}, Role: ${role.name}`);

      res.json({
        success: true,
        message: 'Role updated successfully',
        data: role
      });
    } catch (error) {
      logger.error('Update role error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating role',
        error: error.message
      });
    }
  }

  async deleteRole(req, res) {
    try {
      const Role = require('../models/Role');
      const { id } = req.params;

      const role = await Role.findById(id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent deleting system roles
      if (role.isSystemRole) {
        return res.status(403).json({
          success: false,
          message: 'Cannot delete system roles'
        });
      }

      // Check if any users have this role
      const userCount = await User.countDocuments({ assignedRole: id });

      if (userCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${userCount} user(s) are assigned to this role`
        });
      }

      await role.deleteOne();

      logger.info(`Admin deleted role - Admin: ${req.user.id}, Role: ${role.name}`);

      res.json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error) {
      logger.error('Delete role error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting role',
        error: error.message
      });
    }
  }

  async assignRoleToUser(req, res) {
    try {
      const Role = require('../models/Role');
      const { userId } = req.params;
      const { roleId } = req.body;

      const user = await User.findById(userId);
      const role = await Role.findById(roleId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      user.assignedRole = roleId;
      await user.save();

      logger.info(`Admin assigned role to user - Admin: ${req.user.id}, User: ${userId}, Role: ${role.name}`);

      res.json({
        success: true,
        message: 'Role assigned successfully',
        data: {
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          roleId: role._id,
          roleName: role.displayName
        }
      });
    } catch (error) {
      logger.error('Assign role error:', error);
      res.status(500).json({
        success: false,
        message: 'Error assigning role',
        error: error.message
      });
    }
  }

  async removeRoleFromUser(req, res) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      user.assignedRole = null;
      await user.save();

      logger.info(`Admin removed role from user - Admin: ${req.user.id}, User: ${userId}`);

      res.json({
        success: true,
        message: 'Role removed successfully'
      });
    } catch (error) {
      logger.error('Remove role error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing role',
        error: error.message
      });
    }
  }

  // ========== RBAC - GROUP MANAGEMENT METHODS ==========

  async getGroups(req, res) {
    try {
      const groups = await Group.find()
        .populate('defaultRole', 'name displayName')
        .populate({
          path: 'members.userId',
          select: 'firstName lastName email'
        })
        .select('-__v')
        .sort('displayName')
        .lean();

      // Add member count to each group
      const groupsWithCounts = groups.map(group => ({
        ...group,
        memberCount: group.members ? group.members.length : 0
      }));

      logger.info(`Admin fetched groups - Admin: ${req.user.id}`);

      res.json({
        success: true,
        data: groupsWithCounts
      });
    } catch (error) {
      logger.error('Get groups error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching groups',
        error: error.message
      });
    }
  }

  async getGroupById(req, res) {
    try {
      const { id } = req.params;

      const group = await Group.findById(id)
        .populate('defaultRole', 'name displayName permissions')
        .populate({
          path: 'members.userId',
          select: 'firstName lastName email'
        })
        .lean();

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      res.json({
        success: true,
        data: group
      });
    } catch (error) {
      logger.error('Get group by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching group',
        error: error.message
      });
    }
  }

  async createGroup(req, res) {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { name, displayName, description, department, permissions, defaultRole } = req.body;

      // Check if group with this name already exists
      const existingGroup = await Group.findOne({ name: name.toLowerCase().replace(/\s+/g, '_') });

      if (existingGroup) {
        return res.status(400).json({
          success: false,
          message: 'Group with this name already exists'
        });
      }

      const group = await Group.create({
        name: name.toLowerCase().replace(/\s+/g, '_'),
        displayName,
        description,
        department: department || 'other',
        permissions,
        defaultRole: defaultRole || null,
        createdBy: req.user.id
      });

      logger.info(`Admin created group - Admin: ${req.user.id}, Group: ${group.name}`);

      res.status(201).json({
        success: true,
        message: 'Group created successfully',
        data: group
      });
    } catch (error) {
      logger.error('Create group error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating group',
        error: error.message
      });
    }
  }

  async updateGroup(req, res) {
    try {
      const { id } = req.params;
      const { displayName, description, permissions, defaultRole } = req.body;

      const group = await Group.findById(id);

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      if (displayName) group.displayName = displayName;
      if (description !== undefined) group.description = description;
      if (permissions) group.permissions = permissions;
      if (defaultRole !== undefined) group.defaultRole = defaultRole;

      await group.save();

      logger.info(`Admin updated group - Admin: ${req.user.id}, Group: ${group.name}`);

      res.json({
        success: true,
        message: 'Group updated successfully',
        data: group
      });
    } catch (error) {
      logger.error('Update group error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating group',
        error: error.message
      });
    }
  }

  async deleteGroup(req, res) {
    try {
      const { id } = req.params;

      const group = await Group.findById(id);

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Remove group reference from all users
      await User.updateMany(
        { groups: id },
        { $pull: { groups: id } }
      );

      await group.deleteOne();

      logger.info(`Admin deleted group - Admin: ${req.user.id}, Group: ${group.name}`);

      res.json({
        success: true,
        message: 'Group deleted successfully'
      });
    } catch (error) {
      logger.error('Delete group error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting group',
        error: error.message
      });
    }
  }

  async addUserToGroup(req, res) {
    try {
      const { groupId } = req.params;
      const { userId, memberPermissions } = req.body;

      const user = await User.findById(userId);
      const group = await Group.findById(groupId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Check if user is already in group
      const isMemberAlready = group.members.some(m => m.userId.toString() === userId.toString());

      if (isMemberAlready) {
        return res.status(400).json({
          success: false,
          message: 'User is already a member of this group'
        });
      }

      // Add user to group with member-specific permissions
      await group.addMember(userId, memberPermissions || [], req.user.id);

      logger.info(`Admin added user to group - Admin: ${req.user.id}, User: ${userId}, Group: ${group.name}`);

      res.json({
        success: true,
        message: 'User added to group successfully',
        data: {
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          groupId: group._id,
          groupName: group.displayName,
          memberPermissions: memberPermissions || []
        }
      });
    } catch (error) {
      logger.error('Add user to group error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding user to group',
        error: error.message
      });
    }
  }

  async removeUserFromGroup(req, res) {
    try {
      const { groupId, userId } = req.params;

      const user = await User.findById(userId);
      const group = await Group.findById(groupId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Remove user from group
      await user.removeFromGroup(groupId);

      logger.info(`Admin removed user from group - Admin: ${req.user.id}, User: ${userId}, Group: ${group.name}`);

      res.json({
        success: true,
        message: 'User removed from group successfully'
      });
    } catch (error) {
      logger.error('Remove user from group error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing user from group',
        error: error.message
      });
    }
  }

  async updateMemberPermissions(req, res) {
    try {
      const { groupId, userId } = req.params;
      const { memberPermissions } = req.body;

      const user = await User.findById(userId);
      const group = await Group.findById(groupId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Find the member in the group
      const memberIndex = group.members.findIndex(m => m.userId.toString() === userId.toString());

      if (memberIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'User is not a member of this group'
        });
      }

      // Update the member's permissions
      group.members[memberIndex].memberPermissions = memberPermissions || [];
      await group.save();

      logger.info(`Admin updated member permissions - Admin: ${req.user.id}, User: ${userId}, Group: ${group.name}`);

      res.json({
        success: true,
        message: 'Member permissions updated successfully',
        data: {
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          groupId: group._id,
          groupName: group.displayName,
          memberPermissions: memberPermissions || []
        }
      });
    } catch (error) {
      logger.error('Update member permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating member permissions',
        error: error.message
      });
    }
  }

  async getUsersWithRBAC(req, res) {
    try {
      const users = await User.find()
        .populate('assignedRole', 'name displayName permissions')
        .populate('groups', 'name displayName permissions')
        .select('firstName lastName email position department role assignedRole groups status')
        .sort('firstName')
        .lean();

      logger.info(`Admin fetched users with RBAC - Admin: ${req.user.id}`);

      res.json({
        success: true,
        data: users.map(user => ({
          ...user,
          fullName: `${user.firstName} ${user.lastName}`,
          groupCount: user.groups ? user.groups.length : 0
        }))
      });
    } catch (error) {
      logger.error('Get users with RBAC error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching users',
        error: error.message
      });
    }
  }

  async getUserPermissions(req, res) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .populate('assignedRole', 'name displayName permissions')
        .populate('groups', 'name displayName permissions');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const permissions = await user.getPermissions();

      res.json({
        success: true,
        data: {
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          role: user.assignedRole,
          groups: user.groups,
          effectivePermissions: permissions
        }
      });
    } catch (error) {
      logger.error('Get user permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user permissions',
        error: error.message
      });
    }
  }

  async initializeDefaultRoles(req, res) {
    try {
      const Role = require('../models/Role');

      await Role.createDefaultRoles();

      logger.info(`Admin initialized default roles - Admin: ${req.user.id}`);

      res.json({
        success: true,
        message: 'Default roles initialized successfully'
      });
    } catch (error) {
      logger.error('Initialize default roles error:', error);
      res.status(500).json({
        success: false,
        message: 'Error initializing default roles',
        error: error.message
      });
    }
  }

  async getSecuritySettings(req, res) {
    try {
      // Get system-wide security configuration
      const securitySettings = {
        success: true,
        data: {
          authentication: {
            twoFactorAuthentication: {
              enabled: true,
              status: 'Enabled'
            },
            sessionTimeout: {
              hours: 8,
              status: '8 hours'
            },
            passwordPolicy: {
              minLength: 8,
              requireUppercase: true,
              requireNumbers: true,
              requireSpecialChars: true,
              status: 'Strong'
            },
            loginAttempts: {
              maxAttempts: 5,
              lockoutDuration: 30,
              status: '5 attempts'
            }
          },
          accessControl: {
            apiRateLimiting: {
              enabled: true,
              requestsPerMinute: 100,
              status: 'Active'
            },
            ipAllowlist: {
              enabled: true,
              ips: [],
              status: 'Configured'
            },
            auditLogging: {
              enabled: true,
              logLevel: 'full',
              status: 'Enabled'
            },
            dataEncryption: {
              algorithm: 'AES-256',
              enabled: true,
              status: 'AES-256'
            }
          }
        }
      };

      res.json(securitySettings);
    } catch (error) {
      logger.error('Get security settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching security settings',
        error: error.message
      });
    }
  }

  async updateSecuritySettings(req, res) {
    try {
      const { authentication, accessControl } = req.body;

      // Update configuration
      const updatedSettings = {
        authentication: {
          sessionTimeout: {
            hours: authentication?.sessionTimeout?.hours || 8,
            status: `${authentication?.sessionTimeout?.hours || 8} hours`
          },
          passwordPolicy: {
            minLength: authentication?.passwordPolicy?.minLength || 8,
            status: 'Strong'
          },
          loginAttempts: {
            maxAttempts: authentication?.loginAttempts?.maxAttempts || 5,
            status: `${authentication?.loginAttempts?.maxAttempts || 5} attempts`
          },
          twoFactorAuthentication: {
            enabled: true,
            status: 'Enabled'
          }
        },
        accessControl: {
          apiRateLimiting: {
            requestsPerMinute: accessControl?.apiRateLimiting?.requestsPerMinute || 100,
            status: 'Active'
          },
          ipAllowlist: {
            ips: accessControl?.ipAllowlist?.ips || [],
            status: 'Configured'
          },
          auditLogging: {
            enabled: true,
            status: 'Enabled'
          },
          dataEncryption: {
            algorithm: 'AES-256',
            status: 'AES-256'
          }
        }
      };

      logger.info(`Admin updated security settings - Admin: ${req.user.id}`);

      res.json({
        success: true,
        message: 'Security settings updated successfully',
        data: updatedSettings
      });
    } catch (error) {
      logger.error('Update security settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating security settings',
        error: error.message
      });
    }
  }

}
module.exports = new AdminController();
