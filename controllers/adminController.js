const User = require("../models/User");
const Property = require("../models/Property");
const Investment = require("../models/Investment");
const KYC = require("../models/KYC");
const SimpleOTP = require("../models/SimpleOTP");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const otpEmailService = require("../utils/otpEmailService");
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

// In your AdminController.js, update the createProperty method to remove the minimum value validation

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
      if (location) {
        parsedLocation = typeof location === "string" ? JSON.parse(location) : location;
      }
      if (financials) {
        parsedFinancials = typeof financials === "string" ? JSON.parse(financials) : financials;
      }
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);
      return res.status(400).json({
        success: false,
        message: "Invalid JSON in location or financials fields",
      });
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
        status,
        otp,
      } = req.body;

      // Parse JSON fields
      let parsedLocation = {};
      let parsedFinancials = {};

      try {
        parsedLocation =
          typeof location === "string" ? JSON.parse(location) : location || {};
        parsedFinancials =
          typeof financials === "string"
            ? JSON.parse(financials)
            : financials || {};
      } catch (parseError) {
        console.error("Error parsing JSON fields:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in location or financials fields",
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

  async getProperties(req, res) {
  try {
    console.log("=== GET PROPERTIES - SHOW ALL ===");
    console.log("Query params:", req.query);

    const {
      page = 1,
      limit = 20,
      sort = "-createdAt",
      propertyType,
      search,
      city,
    } = req.query;

    // Build filter - NO STATUS FILTERING AT ALL
    const filter = {};

    // Only filter by non-status fields
    if (propertyType && propertyType !== 'all') {
      console.log("PropertyType filter:", propertyType);
      filter.propertyType = propertyType;
    }
    
    if (city) {
      console.log("City filter:", city);
      filter["location.city"] = city.toLowerCase();
    }

    if (search) {
      console.log("Search filter:", search);
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { titleAr: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "location.address": { $regex: search, $options: "i" } },
        { "location.city": { $regex: search, $options: "i" } },
      ];
    }

    console.log("Final filter (NO STATUS FILTER):", JSON.stringify(filter, null, 2));

    // Debug info
    const totalInDB = await Property.countDocuments();
    const matchingFilter = await Property.countDocuments(filter);
    
    console.log(`Total properties in DB: ${totalInDB}`);
    console.log(`Properties matching filter: ${matchingFilter}`);

    // Show all statuses in DB
    const statusStats = await Property.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    console.log("All statuses in DB:", statusStats);

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get ALL properties (no status filtering in aggregation either)
    const [properties, totalProperties] = await Promise.all([
      Property.aggregate([
        { $match: filter }, // No status filter here
        {
          $lookup: {
            from: "investments",
            localField: "_id",
            foreignField: "property",
            as: "investments",
          },
        },
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
                        "$financials.totalValue"
                      ] 
                    },
                    100
                  ]
                },
                else: { $ifNull: ["$fundingProgress", 0] }
              },
            },
          },
        },
        {
          $sort: {
            [sort.startsWith("-") ? sort.substring(1) : sort]:
              sort.startsWith("-") ? -1 : 1,
          },
        },
        { $skip: skip },
        { $limit: limitNum },
      ]),
      Property.countDocuments(filter),
    ]);

    console.log(`Found ${properties.length} properties`);
    properties.forEach((prop, index) => {
      console.log(`Property ${index + 1}: ${prop.title} - Status: ${prop.status}`);
    });

    const totalPages = Math.ceil(totalProperties / limitNum);

    logger.info(
      `Admin fetched ALL properties - Admin: ${req.user.id}, Found: ${properties.length}/${totalProperties}`
    );

    res.json({
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
        debug: {
          totalInDB,
          matchingFilter,
          statusStats,
          message: "Showing ALL properties regardless of status"
        }
      },
    });

  } catch (error) {
    console.error("Get properties error:", error);
    logger.error("Get properties error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching properties",
      error: error.message,
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

      const totalInvestmentValue = await Investment.aggregate([
        { $match: { status: "confirmed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            totalProperties,
            activeProperties,
            totalInvestments,
            totalUsers,
            pendingKyc,
            totalInvestmentValue: totalInvestmentValue[0]?.total || 0,
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

  

// async createProperty(req, res) {
//   try {
//     console.log("=== CREATE PROPERTY WITH DATABASE OTP ===");
//     console.log("Body:", req.body);
//     console.log("Files:", req.files);

//     const userId = req.user.id;

//     // Add null check for user
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(401).json({
//         success: false,
//         message: "User not found. Please log in again.",
//       });
//     }

//     console.log("User found:", {
//       id: user._id,
//       email: user.email,
//       role: user.role,
//     });

//     // Extract fields from request
//     const {
//       title,
//       description,
//       location,
//       propertyType,
//       financials,
//       status,
//       otp,
//     } = req.body;

//     // Parse JSON fields
//     let parsedLocation = {};
//     let parsedFinancials = {};

//     try {
//       parsedLocation =
//         typeof location === "string" ? JSON.parse(location) : location || {};
//       parsedFinancials =
//         typeof financials === "string"
//           ? JSON.parse(financials)
//           : financials || {};
//     } catch (parseError) {
//       console.error("Error parsing JSON fields:", parseError);
//       return res.status(400).json({
//         success: false,
//         message: "Invalid JSON in location or financials fields",
//       });
//     }

//     // Enhanced validation for financials
//     if (parsedFinancials.totalValue !== undefined) {
//       const totalValue = Number(parsedFinancials.totalValue);
      
//       if (isNaN(totalValue)) {
//         return res.status(400).json({
//           success: false,
//           message: "Property total value must be a valid number",
//         });
//       }

//       if (totalValue < 100000) {
//         return res.status(400).json({
//           success: false,
//           message: "Property total value must be at least ₹1,00,000",
//           validation: {
//             field: "financials.totalValue",
//             minimum: 100000,
//             received: totalValue,
//           },
//         });
//       }

//       // Additional financial validations
//       if (parsedFinancials.expectedReturn !== undefined) {
//         const expectedReturn = Number(parsedFinancials.expectedReturn);
//         if (isNaN(expectedReturn) || expectedReturn < 0 || expectedReturn > 100) {
//           return res.status(400).json({
//             success: false,
//             message: "Expected return must be between 0% and 100%",
//           });
//         }
//       }

//       if (parsedFinancials.minimumInvestment !== undefined) {
//         const minInvestment = Number(parsedFinancials.minimumInvestment);
//         if (isNaN(minInvestment) || minInvestment < 1000) {
//           return res.status(400).json({
//             success: false,
//             message: "Minimum investment must be at least ₹1,000",
//           });
//         }

//         if (minInvestment > totalValue) {
//           return res.status(400).json({
//             success: false,
//             message: "Minimum investment cannot exceed total property value",
//           });
//         }
//       }
//     }

//     // Validate title
//     if (!title || title.trim().length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Property title is required",
//       });
//     }

//     if (title.length > 200) {
//       return res.status(400).json({
//         success: false,
//         message: "Property title cannot exceed 200 characters",
//       });
//     }

//     // If OTP is not provided, send OTP and return
//     if (!otp) {
//       try {
//         console.log("Sending OTP for user:", user._id);

//         const emailResult = await otpEmailService.sendOTP({
//           operation: "create",
//           propertyData: { title, propertyType },
//           adminUser: user,
//           propertyId: null,
//         });

//         console.log("OTP sent for create operation:", emailResult.otpId);

//         return res.status(200).json({
//           success: true,
//           message: "OTP sent successfully",
//           data: {
//             step: "otp_required",
//             message: emailResult.fallbackMode
//               ? "Check console for OTP code (email service unavailable)"
//               : "Check your email for OTP code",
//             expiresIn: "10 minutes",
//             sentTo: emailResult.sentTo,
//             otpId: emailResult.otpId,
//           },
//         });
//       } catch (otpError) {
//         console.error("OTP sending failed:", otpError);
//         logger.error("OTP sending failed:", otpError);
//         return res.status(500).json({
//           success: false,
//           message: "Failed to send OTP. Please try again.",
//           error:
//             process.env.NODE_ENV === "development"
//               ? otpError.message
//               : undefined,
//         });
//       }
//     }

//     // If OTP is provided, verify it
//     if (otp) {
//       const verification = await otpEmailService.verifyOTP(
//         userId,
//         otp,
//         "create"
//       );

//       if (!verification.valid) {
//         return res.status(400).json({
//           success: false,
//           message: verification.reason,
//           attemptsRemaining: verification.attemptsRemaining,
//         });
//       }

//       console.log(
//         `OTP verified successfully for create operation - User: ${userId}`
//       );
//       logger.info(
//         `OTP verified successfully for create operation - User: ${userId}, OTP ID: ${verification.otpRecord._id}`
//       );
//     }

//     // Continue with property creation after validation and OTP verification
//     const propertyData = {
//       title: title.trim(),
//       description: description || "",
//       location: parsedLocation,
//       financials: {
//         ...parsedFinancials,
//         totalValue: Number(parsedFinancials.totalValue) || 0,
//         expectedReturn: Number(parsedFinancials.expectedReturn) || 0,
//         minimumInvestment: Number(parsedFinancials.minimumInvestment) || 1000,
//       },
//       propertyType: propertyType || "residential",
//       status: status || "active",
//       images: [],
//       timeline: {
//         launchDate: new Date(),
//         fundingDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
//       },
//       createdBy: userId,
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     };

//     // Handle image uploads if any
//     if (req.files && req.files.length > 0) {
//       propertyData.images = req.files.map((file, index) => ({
//         url: `/uploads/${file.filename}`,
//         alt: `${title} - Image ${index + 1}`,
//         isPrimary: index === 0,
//         _id: new mongoose.Types.ObjectId(),
//       }));
//     }

//     // Create the property
//     const property = new Property(propertyData);
//     await property.save();

//     logger.info(
//       `Property created successfully - ID: ${property._id}, Title: ${property.title}, Created by: ${userId}`
//     );

//     res.status(201).json({
//       success: true,
//       message: "Property created successfully",
//       data: {
//         id: property._id,
//         title: property.title,
//         status: property.status,
//       },
//     });
//   } catch (error) {
//     console.error("Create property error:", error);
    
//     // Handle mongoose validation errors more gracefully
//     if (error.name === 'ValidationError') {
//       const validationErrors = Object.keys(error.errors).map(key => ({
//         field: key,
//         message: error.errors[key].message,
//         value: error.errors[key].value,
//       }));

//       return res.status(400).json({
//         success: false,
//         message: "Property validation failed",
//         validationErrors: validationErrors,
//       });
//     }

//     logger.error("Create property error:", {
//       error: error.message,
//       stack: error.stack,
//       userId: req.user?.id,
//     });

//     res.status(500).json({
//       success: false,
//       message: "Error creating property",
//       error:
//         process.env.NODE_ENV === "development" ? error.message : undefined,
//     });
//   }
// }

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
        status,
        otp,
      } = req.body;

      // Parse JSON fields
      let parsedLocation = {};
      let parsedFinancials = {};

      try {
        parsedLocation =
          typeof location === "string" ? JSON.parse(location) : location || {};
        parsedFinancials =
          typeof financials === "string"
            ? JSON.parse(financials)
            : financials || {};
      } catch (parseError) {
        console.error("Error parsing JSON fields:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in location or financials fields",
        });
      }

      // If OTP is not provided, send OTP and return
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

  async getProperties(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        status,
        propertyType,
        search,
        city,
      } = req.query;

      // Build filter
      const filter = {};
      if (status) filter.status = status;
      if (propertyType) filter.propertyType = propertyType;
      if (city) filter["location.city"] = city.toLowerCase();

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: "i" } },
          { titleAr: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { "location.address": { $regex: search, $options: "i" } },
          { "location.city": { $regex: search, $options: "i" } },
        ];
      }

      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Get properties with aggregation for additional data
      const [properties, totalProperties] = await Promise.all([
        Property.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: "investments",
              localField: "_id",
              foreignField: "property",
              as: "investments",
            },
          },
          {
            $addFields: {
              investorCount: { $size: "$investments" },
              totalInvested: { $sum: "$investments.amount" },
              fundingProgress: {
                $cond: {
                  if: { $gt: ["$financials.totalValue", 0] },
                  then: {
                    $multiply: [
                      {
                        $divide: [
                          { $sum: "$investments.amount" },
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
          {
            $sort: {
              [sort.startsWith("-") ? sort.substring(1) : sort]:
                sort.startsWith("-") ? -1 : 1,
            },
          },
          { $skip: skip },
          { $limit: limitNum },
        ]),
        Property.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(totalProperties / limitNum);

      logger.info(
        `Admin fetched properties list - Admin: ${req.user.id}, Page: ${page}`
      );

      res.json({
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
        error: error.message,
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

      const totalInvestmentValue = await Investment.aggregate([
        { $match: { status: "confirmed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            totalProperties,
            activeProperties,
            totalInvestments,
            totalUsers,
            pendingKyc,
            totalInvestmentValue: totalInvestmentValue[0]?.total || 0,
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

}
module.exports = new AdminController();
