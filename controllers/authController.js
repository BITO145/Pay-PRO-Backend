import crypto from 'crypto';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createSendToken } from '../middleware/auth.js';
import { authLogger } from '../config/logger.js';
import { emailUtils } from '../utils/email.js';

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (but usually restricted to HR/Admin)
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, address } = req.body;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }
  
  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'employee',
    phone,
    address
  });
  
  // Log the registration
  authLogger.loginSuccess(user._id, req.ip, req.get('User-Agent'));
  
  createSendToken(user, 201, res, 'User registered successfully');
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Check if email and password exist
  if (!email || !password) {
    authLogger.loginFailure(email, req.ip, 'Missing credentials');
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }
  
  // Check for user and include password
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    authLogger.loginFailure(email, req.ip, 'User not found');
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
  
  // Check if password matches
  const isMatch = await user.correctPassword(password, user.password);
  
  if (!isMatch) {
    authLogger.loginFailure(email, req.ip, 'Invalid password');
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
  
  // Check if user is active
  if (user.status !== 'active') {
    authLogger.loginFailure(email, req.ip, 'Account inactive');
    return res.status(401).json({
      success: false,
      message: 'Your account has been deactivated. Please contact administrator.'
    });
  }
  
  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  
  // Log successful login
  authLogger.loginSuccess(user._id, req.ip, req.get('User-Agent'));
  
  createSendToken(user, 200, res, 'Login successful');
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res) => {
  // Log the logout
  authLogger.logout(req.user._id, req.ip);
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  // If user is an employee, get employee details
  let employeeDetails = null;
  if (user.role === 'employee') {
    employeeDetails = await Employee.findOne({ user: user._id })
      .populate('department', 'name')
      .populate('reportingManager', 'user');
  }
  
  res.status(200).json({
    success: true,
    data: {
      user,
      employee: employeeDetails
    }
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, address } = req.body;
  
  const fieldsToUpdate = {};
  if (name) fieldsToUpdate.name = name;
  if (phone) fieldsToUpdate.phone = phone;
  if (address) fieldsToUpdate.address = address;
  
  const user = await User.findByIdAndUpdate(
    req.user._id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // Get user with password
  const user = await User.findById(req.user._id).select('+password');
  
  // Check current password
  const isMatch = await user.correctPassword(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }
  
  // Update password
  user.password = newPassword;
  await user.save();
  
  // Log password change
  authLogger.passwordChanged(user._id, req.ip);
  
  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  const user = await User.findOne({ email });
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No user found with that email'
    });
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token and set to resetPasswordToken field
  user.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Set expire
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  await user.save({ validateBeforeSave: false });
  
  try {
    // Send email
    await emailUtils.sendPasswordResetEmail(user, resetToken);
    
    // Log password reset request
    authLogger.passwordReset(user._id, req.ip);
    
    res.status(200).json({
      success: true,
      message: 'Password reset email sent'
    });
    
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    await user.save({ validateBeforeSave: false });
    
    return res.status(500).json({
      success: false,
      message: 'Email could not be sent'
    });
  }
});

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resettoken
// @access  Public
export const resetPassword = asyncHandler(async (req, res) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');
    
  const user = await User.findOne({
    passwordResetToken,
    passwordResetExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
  
  // Set new password
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  
  await user.save();
  
  // Log password reset completion
  authLogger.passwordChanged(user._id, req.ip);
  
  createSendToken(user, 200, res, 'Password reset successful');
});

// @desc    Verify token
// @route   GET /api/auth/verify-token
// @access  Private
export const verifyToken = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Private
export const refreshToken = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  
  createSendToken(user, 200, res, 'Token refreshed successfully');
});

// @desc    Get user permissions based on role
// @route   GET /api/auth/permissions
// @access  Private
export const getPermissions = asyncHandler(async (req, res) => {
  const { role } = req.user;
  
  const permissions = {
    admin: [
      'manage_users',
      'manage_employees',
      'manage_departments',
      'manage_attendance',
      'manage_leaves',
      'manage_payroll',
      'manage_announcements',
      'manage_holidays',
      'view_reports',
      'export_data',
      'system_settings'
    ],
    hr: [
      'manage_employees',
      'manage_departments',
      'manage_attendance',
      'manage_leaves',
      'manage_payroll',
      'manage_announcements',
      'manage_holidays',
      'view_reports',
      'export_data'
    ],
    employee: [
      'view_own_profile',
      'update_own_profile',
      'mark_attendance',
      'apply_leave',
      'view_own_payroll',
      'view_announcements',
      'view_holidays'
    ]
  };
  
  res.status(200).json({
    success: true,
    data: {
      role,
      permissions: permissions[role] || []
    }
  });
});

export default {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyToken,
  refreshToken,
  getPermissions
};