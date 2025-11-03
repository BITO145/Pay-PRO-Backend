import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import mongoose from 'mongoose';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Create and send token response
const createSendToken = (user, statusCode, res, message = 'Success') => {
  const token = generateToken(user._id);
  
  // Remove password from output
  user.password = undefined;
  
  res.status(statusCode).json({
    success: true,
    message,
    token,
    data: {
      user
    }
  });
};

// Protect routes - JWT Authentication
export const protect = async (req, res, next) => {
  try {
    // 1) Get token and check if it exists
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'You are not logged in! Please log in to get access.'
      });
    }
    
    // 2) Verify token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id).select('+password');
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token does no longer exist.'
      });
    }
    
    // 4) Check if user is active
    if (currentUser.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }
    
    // 5) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        message: 'User recently changed password! Please log in again.'
      });
    }
    
    // Grant access to protected route
    req.user = currentUser;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again!'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your token has expired! Please log in again.'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Restrict to specific roles
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

// Check if user is HR or Admin
export const isHROrAdmin = (req, res, next) => {
  if (!['hr', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. HR or Admin privileges required.'
    });
  }
  next();
};

// Check if user can access employee data (own data or HR/Admin)
export const canAccessEmployee = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    
    // Admin and HR can access any employee data
    if (['admin', 'hr'].includes(req.user.role)) {
      return next();
    }
    
    // Employees can only access their own data
    if (req.user.role === 'employee') {
      const Employee = (await import('../models/Employee.js')).default;
      const employee = await Employee.findOne({ user: req.user._id });
      
      if (!employee || employee._id.toString() !== employeeId) {
        return res.status(403).json({
          success: false,
          message: 'You can only access your own employee data'
        });
      }
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking employee access',
      error: error.message
    });
  }
};

// Audit logging middleware
export const auditLog = (action, targetModel) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Override res.json to capture response data
    const originalJson = res.json;
    res.json = function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // For authentication events, handle missing user/targetId
      if (action.includes('login') || action.includes('logout')) {
        // Skip audit logging for failed authentication attempts
        // as they're already logged by the authLogger
        if (res.statusCode >= 400) {
          return originalJson.call(this, data);
        }
      }

      // Only log if we have required fields
      if (req.user || (action.includes('login') && res.statusCode < 400)) {
        const logData = {
          user: req.user ? req.user._id : null,
          action,
          targetModel,
          targetId: req.user ? req.user._id : new mongoose.Types.ObjectId(), // Use user's ID for login
          targetName: req.body.name || req.body.title || req.body.email || null,
          method: action.includes('login') || action.includes('logout') ? 
                 (action.includes('login') ? 'LOGIN' : 'LOGOUT') : req.method,
          endpoint: req.originalUrl,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          details: {
            query: req.query,
            params: req.params,
            // Don't log sensitive data like passwords
            body: req.method === 'POST' || req.method === 'PUT' ? 
              JSON.stringify(req.body).replace(/"password":"[^"]*"/g, '"password":"[REDACTED]"') : null
          },
          result: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
          errorMessage: res.statusCode >= 400 ? data.message : null,
          duration,
          severity: res.statusCode >= 500 ? 'HIGH' : res.statusCode >= 400 ? 'MEDIUM' : 'LOW',
          category: action.includes('login') ? 'AUTHENTICATION' : 
                   action.includes('access') ? 'AUTHORIZATION' : 
                   req.method === 'GET' ? 'DATA_ACCESS' : 'DATA_MODIFICATION'
        };

        AuditLog.logAction(logData).catch(err => {
          console.error('Audit logging failed:', err);
        });
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Rate limiting for sensitive operations
export const rateLimitSensitive = (req, res, next) => {
  // This would typically use Redis or similar for production
  // For now, we'll implement basic in-memory rate limiting
  if (!req.app.locals.rateLimits) {
    req.app.locals.rateLimits = new Map();
  }
  
  const key = `${req.ip}_${req.user ? req.user._id : 'anonymous'}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;
  
  const userAttempts = req.app.locals.rateLimits.get(key) || { count: 0, resetTime: now + windowMs };
  
  if (now > userAttempts.resetTime) {
    userAttempts.count = 0;
    userAttempts.resetTime = now + windowMs;
  }
  
  if (userAttempts.count >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please try again later.',
      retryAfter: Math.ceil((userAttempts.resetTime - now) / 1000)
    });
  }
  
  userAttempts.count++;
  req.app.locals.rateLimits.set(key, userAttempts);
  
  next();
};

export { createSendToken, generateToken };