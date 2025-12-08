const User = require('../models/User');

/**
 * Middleware to check if user has required permission
 * @param {string} resource - The resource to check (e.g., 'kyc', 'properties')
 * @param {string|Array} actions - The action(s) required (e.g., 'view', 'create', ['view', 'edit'])
 */
const checkPermission = (resource, actions) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Get full user with groups and role populated
      const user = await User.findById(req.user.id)
        .populate('assignedRole')
        .populate('groups');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      // Super admin has all permissions
      if (user.role === 'super_admin') {
        req.user = user; // Update req.user with full user object
        return next();
      }

      // Convert single action to array for consistent checking
      const requiredActions = Array.isArray(actions) ? actions : [actions];

      // Check if user has at least one of the required actions
      let hasPermission = false;

      for (const action of requiredActions) {
        if (await user.hasPermission(resource, action)) {
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `You don't have permission to ${requiredActions.join(' or ')} ${resource}`,
          required: {
            resource,
            actions: requiredActions
          }
        });
      }

      // Attach full user to request for later use
      req.user = user;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

/**
 * Middleware to check if user has admin access (any admin role)
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has admin or super_admin role
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking admin access',
      error: error.message
    });
  }
};

/**
 * Middleware to check if user is super admin
 */
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Super admin access required'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking super admin access',
      error: error.message
    });
  }
};

/**
 * Middleware to get user's permissions and attach to request
 */
const attachPermissions = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }

    const user = await User.findById(req.user.id)
      .populate('assignedRole')
      .populate('groups');

    if (user) {
      req.userPermissions = await user.getPermissions();
      req.user = user;
    }

    next();
  } catch (error) {
    console.error('Error attaching permissions:', error);
    next(); // Continue even if error - let route handle it
  }
};

/**
 * Middleware to check KYC approval/rejection with action-specific permissions
 * Requires 'approve' action for approved status and 'reject' action for rejected status
 */
const checkKycPermission = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get full user with groups and role populated
    const user = await User.findById(req.user.id)
      .populate('assignedRole')
      .populate('groups');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Super admin has all permissions
    if (user.role === 'super_admin') {
      req.user = user;
      return next();
    }

    // Get the status from request body
    const { status } = req.body;

    // Determine required action based on status
    let requiredAction;
    if (status === 'approved') {
      requiredAction = 'approve';
    } else if (status === 'rejected') {
      requiredAction = 'reject';
    } else if (status === 'pending') {
      // Pending status requires manage permission
      requiredAction = 'manage';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid KYC status'
      });
    }

    // Check if user has the required permission for this specific action
    const hasPermission = await user.hasPermission('kyc:approval', requiredAction);

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `You don't have permission to ${requiredAction} KYC status`,
        required: {
          resource: 'kyc:approval',
          action: requiredAction
        }
      });
    }

    // Attach full user to request for later use
    req.user = user;
    next();
  } catch (error) {
    console.error('KYC permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking KYC permissions',
      error: error.message
    });
  }
};

module.exports = {
  checkPermission,
  requireAdmin,
  requireSuperAdmin,
  attachPermissions,
  checkKycPermission
};
