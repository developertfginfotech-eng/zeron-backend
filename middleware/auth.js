const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user by ID from token
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. User not found.',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if user is active
      if (user.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'Account is not active.',
          code: 'INACTIVE_ACCOUNT'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(401).json({
          success: false,
          message: 'Account is temporarily locked due to multiple failed login attempts.',
          code: 'ACCOUNT_LOCKED'
        });
      }

      // Add user info to request object
      req.user = {
        id: user._id,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName
      };

      // Update last login info
      user.lastLogin = new Date();
      user.lastLoginIP = req.ip || req.connection.remoteAddress;
      await user.save();

      logger.info(`User authenticated - ID: ${user._id}, Email: ${user.email}, IP: ${req.ip}`);
      next();

    } catch (tokenError) {
      logger.warn(`Invalid token attempt - IP: ${req.ip}, Error: ${tokenError.message}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        code: 'INVALID_TOKEN'
      });
    }

  } catch (error) {
    logger.error('Authentication error:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Authorization middleware - checks user roles
 * Usage: authorize('admin', 'super_admin')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRole = req.user.role;

      // Check if user has required role
      if (!allowedRoles.includes(userRole)) {
        logger.warn(`Unauthorized access attempt - User: ${req.user.id}, Role: ${userRole}, Required: ${allowedRoles.join(', ')}, IP: ${req.ip}`);
        
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.',
          code: 'INSUFFICIENT_PERMISSIONS',
          userRole: getRoleDisplayName(userRole),
          requiredRoles: allowedRoles.map(role => getRoleDisplayName(role))
        });
      }

      logger.info(`Access authorized - User: ${req.user.id}, Role: ${userRole}, Endpoint: ${req.path}`);
      next();

    } catch (error) {
      logger.error('Authorization error:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        allowedRoles
      });

      return res.status(500).json({
        success: false,
        message: 'Authorization failed',
        code: 'AUTHZ_ERROR'
      });
    }
  };
};

/**
 * Get user-friendly role display names
 */
const getRoleDisplayName = (role) => {
  const roleNames = {
    'user': 'User',
    'admin': 'Administrator',
    'super_admin': 'Super Administrator',
    'kyc_officer': 'KYC Officer',
    'property_manager': 'Property Manager',
    'financial_analyst': 'Financial Analyst',
    'compliance_officer': 'Compliance Officer'
  };

  return roleNames[role] || role;
};

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for endpoints that work for both authenticated and anonymous users
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (user && user.status === 'active' && !user.isLocked) {
          req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            kycStatus: user.kycStatus,
            status: user.status,
            firstName: user.firstName,
            lastName: user.lastName
          };
        }
      } catch (tokenError) {
        // Silently ignore token errors for optional auth
        logger.debug(`Optional auth failed - IP: ${req.ip}, Error: ${tokenError.message}`);
      }
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next(); // Continue even if optional auth fails
  }
};

/**
 * Role hierarchy checker - allows higher roles to access lower role endpoints
 */
const roleHierarchy = {
  'user': 0,
  'admin': 1,
  'kyc_officer': 2,
  'property_manager': 2,
  'financial_analyst': 2,
  'compliance_officer': 2,
  'super_admin': 10
};

const authorizeWithHierarchy = (minimumRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 0;

    if (userLevel < requiredLevel) {
      logger.warn(`Hierarchical access denied - User: ${req.user.id}, Role: ${req.user.role} (level ${userLevel}), Required: ${minimumRole} (level ${requiredLevel})`);
      
      return res.status(403).json({
        success: false,
        message: `Access denied. ${getRoleDisplayName(minimumRole)} role or higher required.`,
        code: 'INSUFFICIENT_ROLE_LEVEL',
        userRole: getRoleDisplayName(req.user.role),
        requiredRole: getRoleDisplayName(minimumRole)
      });
    }

    next();
  };
};

/**
 * Check if user can modify another user (prevent self-modification for sensitive operations)
 */
const preventSelfModification = (req, res, next) => {
  const currentUserId = req.user?.id;
  const targetUserId = req.params.id;

  if (currentUserId === targetUserId) {
    return res.status(400).json({
      success: false,
      message: 'Cannot modify your own account for security reasons',
      code: 'SELF_MODIFICATION_DENIED'
    });
  }

  next();
};

/**
 * Rate limiting for sensitive operations
 */
const rateLimitMap = new Map();

const rateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = `${req.ip}:${req.user?.id || 'anonymous'}`;
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userLimit = rateLimitMap.get(key);
    
    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + windowMs;
      return next();
    }

    if (userLimit.count >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }

    userLimit.count++;
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  authorizeWithHierarchy,
  preventSelfModification,
  rateLimit,
  getRoleDisplayName
};