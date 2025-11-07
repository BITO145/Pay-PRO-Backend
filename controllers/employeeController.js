import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { dataLogger } from '../config/logger.js';
import { emailUtils } from '../utils/email.js';
import { generateUtils, searchUtils, formatUtils } from '../utils/helpers.js';
import razorpayService from '../services/razorpayService.js';
import bcryptjs from 'bcryptjs';

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private (HR/Admin)
export const getEmployees = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    department,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;
  
  // Build query
  let query = {};
  
  // Add search filter
  if (search) {
    const searchQuery = searchUtils.createSearchQuery(search, ['user.name', 'user.email', 'employeeCode', 'designation']);
    query = { ...query, ...searchQuery };
  }
  
  // Add department filter
  if (department) {
    query.department = department;
  }
  
  // Add status filter
  if (status) {
    query.status = status;
  }
  
  // Pagination
  const { skip, limit: limitNum } = searchUtils.getPaginationOptions(page, limit);
  
  // Sort options
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  // Execute query
  const employees = await Employee.find(query)
    .populate('user', 'name email phone address profileImage')
    .populate('department', 'name description')
    .populate('reportingManager', 'user employeeCode')
    .sort(sortOptions)
    .skip(skip)
    .limit(limitNum);
    
  // Get total count for pagination
  const total = await Employee.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: employees,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil(total / limitNum),
      total,
      limit: limitNum
    }
  });
});

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
export const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .populate('user', 'name email phone address profileImage lastLogin')
    .populate('department', 'name description')
    .populate('reportingManager', 'user employeeCode designation');
    
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found'
    });
  }
  
  res.status(200).json({
    success: true,
    data: employee
  });
});

// @desc    Create employee
// @route   POST /api/employees
// @access  Private (HR/Admin)
export const createEmployee = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    address,
    department,
    designation,
    dateOfJoining,
    employmentType,
    workLocation,
    salary,
    personalDetails,
    reportingManager,
    leaveBalance,
    bankDetails
  } = req.body;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists'
    });
  }
  
  // Generate temporary password
  const hashedPassword = await bcryptjs.hash(phone, 10);
  
  // Create user account
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'employee',
    phone,
    address
  });
  
  // Generate employee code
  const employeeCode = await generateUtils.generateEmployeeCode();
  
  // Ensure department exists: accept either ObjectId or an object to create inline
  let departmentId = null;
  if (department && typeof department === 'string' && mongoose.Types.ObjectId.isValid(department)) {
    departmentId = department;
  } else if (department && typeof department === 'object') {
    // Inline department creation or reuse
    const deptName = department.name?.trim();
    const deptDesc = department.description?.toString().trim();
    const deptBudget = department.budget;

    if (!deptName) {
      return res.status(400).json({ success: false, message: 'Department name is required' });
    }

    // Try to find existing department by exact name (case-insensitive)
    const existingDept = await Department.findOne({
      name: { $regex: new RegExp('^' + deptName + '$', 'i') }
    });
    if (existingDept) {
      departmentId = existingDept._id;
    } else {
      const newDept = await Department.create({
        name: deptName,
        description: deptDesc,
        budget: deptBudget,
        createdBy: req.user._id
      });
      departmentId = newDept._id;
    }
  } else {
    // If department is required but not provided
    if (!department) {
      return res.status(400).json({ success: false, message: 'Department is required' });
    }
    // Invalid department format
    return res.status(400).json({ success: false, message: 'Invalid department' });
  }

  // Normalize employment type if coming as 'permanent' from UI
  const normalizedEmploymentType = employmentType === 'permanent' ? 'full-time' : employmentType;

  // Create employee record
  const employee = await Employee.create({
    user: user._id,
    employeeCode,
    department: departmentId,
    designation,
    dateOfJoining,
    employmentType: normalizedEmploymentType,
    workLocation,
    salary,
    personalDetails,
    reportingManager,
    leaveBalance: leaveBalance || {
      casual: 12,
      sick: 12,
      earned: 15,
      unpaid: 0
    },
    bankDetails
  });
  
  // Populate the created employee
  await employee.populate('user', 'name email phone');
  await employee.populate('department', 'name');

  // Setup RazorpayX integration if bank details are provided
  if (bankDetails && (bankDetails.accountNumber || bankDetails.upiId)) {
    try {
      // Create Razorpay contact
      const contactData = {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        employeeId: employee._id.toString()
      };

      const contact = await razorpayService.createContact(contactData);
      
      // Create fund account based on payout method
      let fundAccount = null;
      if (bankDetails.payoutMethod === 'bank_account' && bankDetails.accountNumber) {
        fundAccount = await razorpayService.createBankAccount(contact.id, {
          accountHolderName: bankDetails.accountHolderName,
          ifsc: bankDetails.ifscCode,
          accountNumber: bankDetails.accountNumber
        });
      } else if (bankDetails.payoutMethod === 'upi' && bankDetails.upiId) {
        fundAccount = await razorpayService.createUpiAccount(contact.id, {
          upiId: bankDetails.upiId
        });
      }

      // Update employee with RazorpayX data
      if (contact && fundAccount) {
        await Employee.findByIdAndUpdate(employee._id, {
          'razorpayData.contactId': contact.id,
          'razorpayData.fundAccountId': fundAccount.id,
          'razorpayData.isRazorpaySetup': true,
          'razorpayData.lastSyncedAt': new Date()
        });

        console.log(`RazorpayX setup completed for employee: ${user.name}`);
      }
    } catch (razorpayError) {
      console.error('RazorpayX setup failed:', razorpayError);
      // Don't fail employee creation if Razorpay setup fails
      // Just log the error and continue
    }
  }
  
  try {
    // Send welcome email with credentials
    await emailUtils.sendWelcomeEmail(employee, tempPassword);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
  
  // Log the creation
  dataLogger.create('Employee', employee._id, req.user._id, req.ip);
  
  res.status(201).json({
    success: true,
    message: 'Employee created successfully',
    data: employee
  });
});

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (HR/Admin or Own Profile)
export const updateEmployee = asyncHandler(async (req, res) => {
  let employee = await Employee.findById(req.params.id);
  
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found'
    });
  }
  
  // Check if user can update this employee
  if (req.user.role === 'employee' && employee.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You can only update your own profile'
    });
  }
  
  const {
    department,
    designation,
    employmentType,
    workLocation,
    salary,
    personalDetails,
    reportingManager,
    status,
    dateOfLeaving
  } = req.body;
  
  // Store old data for audit
  const oldData = employee.toObject();
  
  // Update fields
  const fieldsToUpdate = {};
  if (department) fieldsToUpdate.department = department;
  if (designation) fieldsToUpdate.designation = designation;
  if (employmentType) fieldsToUpdate.employmentType = employmentType;
  if (workLocation) fieldsToUpdate.workLocation = workLocation;
  if (salary) fieldsToUpdate.salary = { ...employee.salary, ...salary };
  if (personalDetails) fieldsToUpdate.personalDetails = { ...employee.personalDetails, ...personalDetails };
  if (reportingManager) fieldsToUpdate.reportingManager = reportingManager;
  if (status) fieldsToUpdate.status = status;
  if (dateOfLeaving) fieldsToUpdate.dateOfLeaving = dateOfLeaving;
  
  employee = await Employee.findByIdAndUpdate(
    req.params.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  ).populate('user', 'name email phone')
   .populate('department', 'name');
  
  // Log the update
  dataLogger.update('Employee', employee._id, req.user._id, req.ip, {
    before: oldData,
    after: employee.toObject()
  });
  
  res.status(200).json({
    success: true,
    message: 'Employee updated successfully',
    data: employee
  });
});

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (HR/Admin)
export const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found'
    });
  }
  
  // Instead of hard delete, mark as inactive/terminated
  employee.status = 'terminated';
  employee.dateOfLeaving = new Date();
  await employee.save();
  
  // Also deactivate user account
  await User.findByIdAndUpdate(employee.user, { status: 'inactive' });
  
  // Log the deletion
  dataLogger.delete('Employee', employee._id, req.user._id, req.ip);
  
  res.status(200).json({
    success: true,
    message: 'Employee deactivated successfully'
  });
});

// @desc    Get employee dashboard data
// @route   GET /api/employees/:id/dashboard
// @access  Private
export const getEmployeeDashboard = asyncHandler(async (req, res) => {
  const employeeId = req.params.id;
  
  // Check if user can access this dashboard
  if (req.user.role === 'employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee || employee._id.toString() !== employeeId) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own dashboard'
      });
    }
  }
  
  const employee = await Employee.findById(employeeId)
    .populate('user', 'name email profileImage')
    .populate('department', 'name');
    
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found'
    });
  }
  
  // Get current month attendance
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  
  const Attendance = (await import('../models/Attendance.js')).default;
  const Leave = (await import('../models/Leave.js')).default;
  const Announcement = (await import('../models/Announcement.js')).default;
  
  // Get attendance summary for current month
  const attendanceRecords = await Attendance.find({
    employee: employeeId,
    date: { $gte: startOfMonth, $lte: endOfMonth }
  });
  
  const attendanceSummary = {
    present: attendanceRecords.filter(a => a.status === 'Present').length,
    absent: attendanceRecords.filter(a => a.status === 'Absent').length,
    leaves: attendanceRecords.filter(a => a.status === 'Leave').length,
    halfDays: attendanceRecords.filter(a => a.status === 'Half Day').length,
    totalWorkingHours: attendanceRecords.reduce((sum, a) => sum + (a.workingHours || 0), 0)
  };
  
  // Get leave balance
  const leaveBalance = await Leave.getLeaveBalance(employeeId);
  
  // Get pending leaves
  const pendingLeaves = await Leave.find({
    employee: employeeId,
    status: 'Pending'
  }).sort({ createdAt: -1 });
  
  // Get recent announcements
  const recentAnnouncements = await Announcement.getAnnouncementsForUser(employee.user._id);
  
  // Get today's attendance
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayAttendance = await Attendance.findOne({
    employee: employeeId,
    date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
  });
  
  res.status(200).json({
    success: true,
    data: {
      employee,
      attendanceSummary,
      leaveBalance,
      pendingLeaves,
      recentAnnouncements: recentAnnouncements.slice(0, 5),
      todayAttendance
    }
  });
});

// @desc    Get employee statistics
// @route   GET /api/employees/statistics
// @access  Private (HR/Admin)
export const getEmployeeStatistics = asyncHandler(async (req, res) => {
  const totalEmployees = await Employee.countDocuments();
  const activeEmployees = await Employee.countDocuments({ status: 'active' });
  const inactiveEmployees = await Employee.countDocuments({ status: 'inactive' });
  const terminatedEmployees = await Employee.countDocuments({ status: 'terminated' });
  
  // Get employees by department
  const employeesByDepartment = await Employee.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
    { $unwind: '$department' },
    { $project: { departmentName: '$department.name', count: 1 } }
  ]);
  
  // Get employees by employment type
  const employeesByType = await Employee.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$employmentType', count: { $sum: 1 } } }
  ]);
  
  // Get recent joiners (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentJoiners = await Employee.find({
    dateOfJoining: { $gte: thirtyDaysAgo },
    status: 'active'
  }).populate('user', 'name').sort({ dateOfJoining: -1 }).limit(10);
  
  res.status(200).json({
    success: true,
    data: {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      terminatedEmployees,
      employeesByDepartment,
      employeesByType,
      recentJoiners
    }
  });
});

// @desc    Bulk import employees
// @route   POST /api/employees/bulk-import
// @access  Private (HR/Admin)
export const bulkImportEmployees = asyncHandler(async (req, res) => {
  const { employees } = req.body;
  
  if (!Array.isArray(employees) || employees.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an array of employees'
    });
  }
  
  const results = {
    success: [],
    errors: []
  };
  
  for (let i = 0; i < employees.length; i++) {
    try {
      const employeeData = employees[i];
      
      // Check if user already exists
      const existingUser = await User.findOne({ email: employeeData.email });
      if (existingUser) {
        results.errors.push({
          row: i + 1,
          email: employeeData.email,
          error: 'User with this email already exists'
        });
        continue;
      }
      
      // Generate temporary password
      const tempPassword = generateUtils.generatePassword();
      
      // Create user
      const user = await User.create({
        name: employeeData.name,
        email: employeeData.email,
        password: tempPassword,
        role: 'employee',
        phone: employeeData.phone,
        address: employeeData.address
      });
      
      // Generate employee code
      const employeeCode = await generateUtils.generateEmployeeCode();
      
      // Create employee
      const employee = await Employee.create({
        user: user._id,
        employeeCode,
        department: employeeData.department,
        designation: employeeData.designation,
        dateOfJoining: employeeData.dateOfJoining,
        employmentType: employeeData.employmentType || 'full-time',
        workLocation: employeeData.workLocation || 'office',
        salary: employeeData.salary
      });
      
      results.success.push({
        row: i + 1,
        employeeCode,
        name: employeeData.name,
        email: employeeData.email,
        tempPassword
      });
      
      // Log the creation
      dataLogger.create('Employee', employee._id, req.user._id, req.ip);
      
    } catch (error) {
      results.errors.push({
        row: i + 1,
        email: employees[i].email,
        error: error.message
      });
    }
  }
  
  res.status(200).json({
    success: true,
    message: `Bulk import completed. ${results.success.length} employees created, ${results.errors.length} errors.`,
    data: results
  });
});

export default {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeDashboard,
  getEmployeeStatistics,
  bulkImportEmployees
};