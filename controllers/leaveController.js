import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { dataLogger } from '../config/logger.js';
import { emailUtils } from '../utils/email.js';
import { dateUtils, searchUtils } from '../utils/helpers.js';

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private (Employee)
export const applyLeave = asyncHandler(async (req, res) => {
  const {
    type,
    fromDate,
    toDate,
    reason,
    isHalfDay,
    halfDaySession,
    emergencyContact,
    handoverTo,
    handoverNotes
  } = req.body;
  
  // Get employee record
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found'
    });
  }
  
  // Check for leave conflicts
  const conflicts = await Leave.checkLeaveConflict(employee._id, new Date(fromDate), new Date(toDate));
  if (conflicts.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'You already have a leave application for the selected dates'
    });
  }
  
  // Check leave balance
  const leaveBalance = await Leave.getLeaveBalance(employee._id);
  const leaveTypeKey = type.toLowerCase();
  
  if (leaveBalance[leaveTypeKey] && leaveBalance[leaveTypeKey].remaining <= 0) {
    return res.status(400).json({
      success: false,
      message: `Insufficient ${type} leave balance`
    });
  }
  
  // Calculate total days
  let totalDays;
  if (isHalfDay) {
    totalDays = 0.5;
  } else {
    totalDays = dateUtils.getDaysDifference(new Date(fromDate), new Date(toDate)) + 1;
  }
  
  // Check if requested days exceed available balance (except for unpaid leave)
  if (type !== 'Unpaid' && leaveBalance[leaveTypeKey] && totalDays > leaveBalance[leaveTypeKey].remaining) {
    return res.status(400).json({
      success: false,
      message: `Requested ${totalDays} days exceeds available ${type} leave balance of ${leaveBalance[leaveTypeKey].remaining} days`
    });
  }
  
  const leave = await Leave.create({
    employee: employee._id,
    type,
    fromDate: new Date(fromDate),
    toDate: new Date(toDate),
    reason,
    isHalfDay,
    halfDaySession,
    emergencyContact,
    handoverTo,
    handoverNotes
  });
  
  await leave.populate('employee', 'user employeeCode');
  
  try {
    // Notify HR about the leave application
    await emailUtils.notifyHRLeaveApplication(leave, employee);
  } catch (error) {
    console.error('Failed to send leave notification email:', error);
  }
  
  // Log the application
  dataLogger.create('Leave', leave._id, req.user._id, req.ip);
  
  res.status(201).json({
    success: true,
    message: 'Leave application submitted successfully',
    data: leave
  });
});

// @desc    Get leave applications
// @route   GET /api/leaves
// @access  Private
export const getLeaves = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    employee,
    status,
    type,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;
  
  let query = {};
  
  // If user is employee, can only see own leaves
  if (req.user.role === 'employee') {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (!employeeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }
    query.employee = employeeRecord._id;
  } else if (employee) {
    // HR/Admin can filter by specific employee
    query.employee = employee;
  }
  
  // Add filters
  if (status) query.status = status;
  if (type) query.type = type;
  
  // Add date range filter for leave dates
  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    query.fromDate = dateFilter;
  }
  
  // Pagination
  const { skip, limit: limitNum } = searchUtils.getPaginationOptions(page, limit);
  
  // Sort options
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const leaves = await Leave.find(query)
    .populate({
      path: 'employee',
      select: 'employeeCode user department',
      populate: [
        { path: 'user', select: 'name email' },
        { path: 'department', select: 'name' }
      ]
    })
    .populate('approvedBy', 'name email')
    .populate('handoverTo', 'user employeeCode')
    .sort(sortOptions)
    .skip(skip)
    .limit(limitNum);
  
  const total = await Leave.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: leaves,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil(total / limitNum),
      total,
      limit: limitNum
    }
  });
});

// @desc    Get single leave application
// @route   GET /api/leaves/:id
// @access  Private
export const getLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id)
    .populate({
      path: 'employee',
      select: 'employeeCode user department designation',
      populate: [
        { path: 'user', select: 'name email phone' },
        { path: 'department', select: 'name' }
      ]
    })
    .populate('approvedBy', 'name email role')
    .populate('handoverTo', 'user employeeCode');
    
  if (!leave) {
    return res.status(404).json({
      success: false,
      message: 'Leave application not found'
    });
  }
  
  // Check if user can access this leave
  if (req.user.role === 'employee') {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (!employeeRecord || leave.employee._id.toString() !== employeeRecord._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own leave applications'
      });
    }
  }
  
  res.status(200).json({
    success: true,
    data: leave
  });
});

// @desc    Update leave status (Approve/Reject)
// @route   PUT /api/leaves/:id/status
// @access  Private (HR/Admin)
export const updateLeaveStatus = asyncHandler(async (req, res) => {
  const { status, comments, rejectionReason } = req.body;
  
  const leave = await Leave.findById(req.params.id)
    .populate('employee', 'user employeeCode');
    
  if (!leave) {
    return res.status(404).json({
      success: false,
      message: 'Leave application not found'
    });
  }
  
  if (leave.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: 'Leave application has already been processed'
    });
  }
  
  // Store old status for audit
  const oldStatus = leave.status;
  
  // Update leave status
  leave.status = status;
  leave.approvedBy = req.user._id;
  leave.approvedDate = new Date();
  
  if (status === 'Approved') {
    leave.comments = comments;
  } else if (status === 'Rejected') {
    leave.rejectionReason = rejectionReason;
    leave.comments = comments;
  }
  
  await leave.save();
  
  try {
    // Send notification email to employee
    await emailUtils.sendLeaveStatusUpdate(leave, leave.employee);
  } catch (error) {
    console.error('Failed to send leave status update email:', error);
  }
  
  // Log the status update
  dataLogger.update('Leave', leave._id, req.user._id, req.ip, {
    statusChange: { from: oldStatus, to: status },
    comments, rejectionReason
  });
  
  res.status(200).json({
    success: true,
    message: `Leave application ${status.toLowerCase()} successfully`,
    data: leave
  });
});

// @desc    Update leave application (by employee)
// @route   PUT /api/leaves/:id
// @access  Private (Employee - own leaves only)
export const updateLeave = asyncHandler(async (req, res) => {
  let leave = await Leave.findById(req.params.id);
  
  if (!leave) {
    return res.status(404).json({
      success: false,
      message: 'Leave application not found'
    });
  }
  
  // Check if user owns this leave
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee || leave.employee.toString() !== employee._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You can only update your own leave applications'
    });
  }
  
  // Can only update pending leaves
  if (leave.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: 'You can only update pending leave applications'
    });
  }
  
  const {
    type,
    fromDate,
    toDate,
    reason,
    isHalfDay,
    halfDaySession,
    emergencyContact,
    handoverTo,
    handoverNotes
  } = req.body;
  
  // Check for conflicts if dates are being changed
  if ((fromDate && fromDate !== leave.fromDate.toISOString()) || 
      (toDate && toDate !== leave.toDate.toISOString())) {
    const conflicts = await Leave.checkLeaveConflict(
      employee._id, 
      new Date(fromDate || leave.fromDate), 
      new Date(toDate || leave.toDate),
      leave._id
    );
    
    if (conflicts.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have a leave application for the selected dates'
      });
    }
  }
  
  // Store old data for audit
  const oldData = leave.toObject();
  
  // Update fields
  const fieldsToUpdate = {};
  if (type) fieldsToUpdate.type = type;
  if (fromDate) fieldsToUpdate.fromDate = new Date(fromDate);
  if (toDate) fieldsToUpdate.toDate = new Date(toDate);
  if (reason) fieldsToUpdate.reason = reason;
  if (isHalfDay !== undefined) fieldsToUpdate.isHalfDay = isHalfDay;
  if (halfDaySession) fieldsToUpdate.halfDaySession = halfDaySession;
  if (emergencyContact) fieldsToUpdate.emergencyContact = emergencyContact;
  if (handoverTo) fieldsToUpdate.handoverTo = handoverTo;
  if (handoverNotes) fieldsToUpdate.handoverNotes = handoverNotes;
  
  leave = await Leave.findByIdAndUpdate(
    req.params.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  ).populate('employee', 'user employeeCode');
  
  // Log the update
  dataLogger.update('Leave', leave._id, req.user._id, req.ip, {
    before: oldData,
    after: leave.toObject()
  });
  
  res.status(200).json({
    success: true,
    message: 'Leave application updated successfully',
    data: leave
  });
});

// @desc    Cancel leave application
// @route   DELETE /api/leaves/:id
// @access  Private (Employee - own leaves only)
export const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);
  
  if (!leave) {
    return res.status(404).json({
      success: false,
      message: 'Leave application not found'
    });
  }
  
  // Check if user owns this leave
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee || leave.employee.toString() !== employee._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You can only cancel your own leave applications'
    });
  }
  
  // Can only cancel pending or approved leaves (before the leave date)
  if (leave.status === 'Rejected' || leave.status === 'Cancelled') {
    return res.status(400).json({
      success: false,
      message: 'Leave application is already processed'
    });
  }
  
  // Check if leave has started
  if (new Date() >= leave.fromDate) {
    return res.status(400).json({
      success: false,
      message: 'Cannot cancel leave that has already started'
    });
  }
  
  leave.status = 'Cancelled';
  await leave.save();
  
  // Log the cancellation
  dataLogger.update('Leave', leave._id, req.user._id, req.ip, { action: 'cancelled' });
  
  res.status(200).json({
    success: true,
    message: 'Leave application cancelled successfully',
    data: leave
  });
});

// @desc    Get leave balance
// @route   GET /api/leaves/balance/:employeeId?
// @access  Private
export const getLeaveBalance = asyncHandler(async (req, res) => {
  let employeeId = req.params.employeeId;
  
  // If no employeeId provided or user is employee, use their own record
  if (!employeeId || req.user.role === 'employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }
    employeeId = employee._id;
  }
  
  const leaveBalance = await Leave.getLeaveBalance(employeeId);
  
  res.status(200).json({
    success: true,
    data: leaveBalance
  });
});

// @desc    Get leave calendar
// @route   GET /api/leaves/calendar
// @access  Private
export const getLeaveCalendar = asyncHandler(async (req, res) => {
  const { month, year, department } = req.query;
  
  // Default to current month/year if not provided
  const currentDate = new Date();
  const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
  const targetYear = year ? parseInt(year) : currentDate.getFullYear();
  
  // Get month range
  const { startDate, endDate } = dateUtils.getMonthRange(targetYear, targetMonth);
  
  let query = {
    status: 'Approved',
    $or: [
      { fromDate: { $gte: startDate, $lte: endDate } },
      { toDate: { $gte: startDate, $lte: endDate } },
      { fromDate: { $lte: startDate }, toDate: { $gte: endDate } }
    ]
  };
  
  // Filter by department if provided
  if (department) {
    const employees = await Employee.find({ department }).select('_id');
    query.employee = { $in: employees.map(emp => emp._id) };
  }
  
  const leaves = await Leave.find(query)
    .populate({
      path: 'employee',
      select: 'employeeCode user department',
      populate: [
        { path: 'user', select: 'name' },
        { path: 'department', select: 'name' }
      ]
    })
    .sort({ fromDate: 1 });
  
  res.status(200).json({
    success: true,
    data: {
      month: targetMonth,
      year: targetYear,
      leaves
    }
  });
});

// @desc    Get leave statistics
// @route   GET /api/leaves/statistics
// @access  Private (HR/Admin)
export const getLeaveStatistics = asyncHandler(async (req, res) => {
  const { year } = req.query;
  const targetYear = year ? parseInt(year) : new Date().getFullYear();
  
  // Get leaves for the year
  const startOfYear = new Date(targetYear, 0, 1);
  const endOfYear = new Date(targetYear, 11, 31);
  
  // Total leaves by status
  const leavesByStatus = await Leave.aggregate([
    {
      $match: {
        fromDate: { $gte: startOfYear, $lte: endOfYear }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDays: { $sum: '$totalDays' }
      }
    }
  ]);
  
  // Leaves by type
  const leavesByType = await Leave.aggregate([
    {
      $match: {
        fromDate: { $gte: startOfYear, $lte: endOfYear },
        status: 'Approved'
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalDays: { $sum: '$totalDays' }
      }
    }
  ]);
  
  // Monthly leave trend
  const monthlyTrend = await Leave.aggregate([
    {
      $match: {
        fromDate: { $gte: startOfYear, $lte: endOfYear },
        status: 'Approved'
      }
    },
    {
      $group: {
        _id: { $month: '$fromDate' },
        count: { $sum: 1 },
        totalDays: { $sum: '$totalDays' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
  
  // Top leave takers
  const topLeaveTakers = await Leave.aggregate([
    {
      $match: {
        fromDate: { $gte: startOfYear, $lte: endOfYear },
        status: 'Approved'
      }
    },
    {
      $group: {
        _id: '$employee',
        totalLeaves: { $sum: 1 },
        totalDays: { $sum: '$totalDays' }
      }
    },
    { $sort: { totalDays: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'employees',
        localField: '_id',
        foreignField: '_id',
        as: 'employee'
      }
    },
    { $unwind: '$employee' },
    {
      $lookup: {
        from: 'users',
        localField: 'employee.user',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        employeeName: '$user.name',
        employeeCode: '$employee.employeeCode',
        totalLeaves: 1,
        totalDays: 1
      }
    }
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      year: targetYear,
      leavesByStatus,
      leavesByType,
      monthlyTrend,
      topLeaveTakers
    }
  });
});

export default {
  applyLeave,
  getLeaves,
  getLeave,
  updateLeaveStatus,
  updateLeave,
  cancelLeave,
  getLeaveBalance,
  getLeaveCalendar,
  getLeaveStatistics
};