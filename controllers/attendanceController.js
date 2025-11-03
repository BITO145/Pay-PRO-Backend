import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import Holiday from '../models/Holiday.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { dataLogger } from '../config/logger.js';
import { dateUtils, searchUtils } from '../utils/helpers.js';

// @desc    Mark attendance (Check-in/Check-out)
// @route   POST /api/attendance/mark
// @access  Private (Employee)
export const markAttendance = asyncHandler(async (req, res) => {
  const { type, location } = req.body; // type: 'checkin' or 'checkout'
  
  // Get employee record
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found'
    });
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Check if today is a holiday
  const isHoliday = await Holiday.isHoliday(new Date(), req.user._id);
  if (isHoliday) {
    return res.status(400).json({
      success: false,
      message: `Today is a holiday: ${isHoliday.name}. Attendance cannot be marked.`
    });
  }
  
  // Check if it's weekend
  if (dateUtils.isWeekend(new Date())) {
    return res.status(400).json({
      success: false,
      message: 'Attendance cannot be marked on weekends'
    });
  }
  
  // Find or create today's attendance record
  let attendance = await Attendance.findOne({
    employee: employee._id,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    }
  });
  
  const now = new Date();
  
  if (type === 'checkin') {
    // Check if already checked in
    if (attendance && attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked in today'
      });
    }
    
    // Create or update attendance record
    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: today,
        checkIn: now,
        status: 'Present',
        location: {
          checkInLocation: location
        },
        ipAddress: {
          checkInIP: req.ip
        }
      });
    } else {
      attendance.checkIn = now;
      attendance.status = 'Present';
      attendance.location.checkInLocation = location;
      attendance.ipAddress.checkInIP = req.ip;
    }
    
  } else if (type === 'checkout') {
    // Check if not checked in yet
    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: 'You need to check in first'
      });
    }
    
    // Check if already checked out
    if (attendance.checkOut) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked out today'
      });
    }
    
    attendance.checkOut = now;
    attendance.location.checkOutLocation = location;
    attendance.ipAddress.checkOutIP = req.ip;
  }
  
  await attendance.save();
  
  // Log the action
  dataLogger.create('Attendance', attendance._id, req.user._id, req.ip);
  
  res.status(200).json({
    success: true,
    message: `${type === 'checkin' ? 'Checked in' : 'Checked out'} successfully`,
    data: attendance
  });
});

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
export const getAttendance = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    employee,
    startDate,
    endDate,
    status,
    sortBy = 'date',
    sortOrder = 'desc'
  } = req.query;
  
  let query = {};
  
  // If user is employee, can only see own records
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
  
  // Add date range filter
  if (startDate || endDate) {
    query = { ...query, ...searchUtils.createDateRangeFilter(startDate, endDate, 'date') };
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
  
  const attendanceRecords = await Attendance.find(query)
    .populate('employee', 'employeeCode user')
    .populate('employee.user', 'name email')
    .sort(sortOptions)
    .skip(skip)
    .limit(limitNum);
  
  const total = await Attendance.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: attendanceRecords,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil(total / limitNum),
      total,
      limit: limitNum
    }
  });
});

// @desc    Get single attendance record
// @route   GET /api/attendance/:id
// @access  Private
export const getAttendanceById = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id)
    .populate('employee', 'employeeCode user designation')
    .populate('employee.user', 'name email');
    
  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: 'Attendance record not found'
    });
  }
  
  // Check if user can access this record
  if (req.user.role === 'employee') {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (!employeeRecord || attendance.employee._id.toString() !== employeeRecord._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own attendance records'
      });
    }
  }
  
  res.status(200).json({
    success: true,
    data: attendance
  });
});

// @desc    Update attendance record (Manual entry by HR/Admin)
// @route   PUT /api/attendance/:id
// @access  Private (HR/Admin)
export const updateAttendance = asyncHandler(async (req, res) => {
  let attendance = await Attendance.findById(req.params.id);
  
  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: 'Attendance record not found'
    });
  }
  
  const { checkIn, checkOut, status, remarks } = req.body;
  
  // Store old data for audit
  const oldData = attendance.toObject();
  
  // Update fields
  const fieldsToUpdate = {};
  if (checkIn) fieldsToUpdate.checkIn = new Date(checkIn);
  if (checkOut) fieldsToUpdate.checkOut = new Date(checkOut);
  if (status) fieldsToUpdate.status = status;
  if (remarks) fieldsToUpdate.remarks = remarks;
  
  attendance = await Attendance.findByIdAndUpdate(
    req.params.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  ).populate('employee', 'employeeCode user');
  
  // Log the update
  dataLogger.update('Attendance', attendance._id, req.user._id, req.ip, {
    before: oldData,
    after: attendance.toObject()
  });
  
  res.status(200).json({
    success: true,
    message: 'Attendance record updated successfully',
    data: attendance
  });
});

// @desc    Create manual attendance entry
// @route   POST /api/attendance/manual
// @access  Private (HR/Admin)
export const createManualAttendance = asyncHandler(async (req, res) => {
  const { employee, date, checkIn, checkOut, status, remarks } = req.body;
  
  // Check if attendance already exists for this date
  const existingAttendance = await Attendance.findOne({
    employee,
    date: {
      $gte: new Date(date),
      $lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
    }
  });
  
  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      message: 'Attendance record already exists for this date'
    });
  }
  
  const attendance = await Attendance.create({
    employee,
    date: new Date(date),
    checkIn: checkIn ? new Date(checkIn) : null,
    checkOut: checkOut ? new Date(checkOut) : null,
    status,
    remarks,
    approvedBy: req.user._id
  });
  
  await attendance.populate('employee', 'employeeCode user');
  
  // Log the creation
  dataLogger.create('Attendance', attendance._id, req.user._id, req.ip);
  
  res.status(201).json({
    success: true,
    message: 'Manual attendance entry created successfully',
    data: attendance
  });
});

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Private (HR/Admin)
export const deleteAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);
  
  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: 'Attendance record not found'
    });
  }
  
  await attendance.deleteOne();
  
  // Log the deletion
  dataLogger.delete('Attendance', req.params.id, req.user._id, req.ip);
  
  res.status(200).json({
    success: true,
    message: 'Attendance record deleted successfully'
  });
});

// @desc    Get attendance summary
// @route   GET /api/attendance/summary
// @access  Private
export const getAttendanceSummary = asyncHandler(async (req, res) => {
  const { employee, startDate, endDate, period = 'month' } = req.query;
  
  let employeeId = employee;
  
  // If user is employee, can only see own summary
  if (req.user.role === 'employee') {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (!employeeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }
    employeeId = employeeRecord._id;
  }
  
  // Calculate date range based on period
  let start, end;
  const now = new Date();
  
  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }
  
  const summary = await Attendance.getAttendanceSummary(employeeId, start, end);
  
  // Get working days in the period
  const totalWorkingDays = dateUtils.getWorkingDaysInMonth(start.getFullYear(), start.getMonth() + 1);
  
  // Calculate additional metrics
  const presentDays = summary.find(s => s._id === 'Present')?.count || 0;
  const absentDays = summary.find(s => s._id === 'Absent')?.count || 0;
  const leaveDays = summary.find(s => s._id === 'Leave')?.count || 0;
  const halfDays = summary.find(s => s._id === 'Half Day')?.count || 0;
  
  const attendancePercentage = ((presentDays + (halfDays * 0.5)) / totalWorkingDays) * 100;
  
  res.status(200).json({
    success: true,
    data: {
      period: { start, end },
      totalWorkingDays,
      presentDays,
      absentDays,
      leaveDays,
      halfDays,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100,
      totalWorkingHours: summary.reduce((sum, s) => sum + (s.totalWorkingHours || 0), 0),
      totalOvertimeHours: summary.reduce((sum, s) => sum + (s.totalOvertimeHours || 0), 0),
      breakdown: summary
    }
  });
});

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private (Employee)
export const getTodayAttendance = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee record not found'
    });
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const attendance = await Attendance.findOne({
    employee: employee._id,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    }
  });
  
  // Check if today is a holiday
  const isHoliday = await Holiday.isHoliday(new Date(), req.user._id);
  
  res.status(200).json({
    success: true,
    data: {
      attendance,
      isWeekend: dateUtils.isWeekend(new Date()),
      isHoliday: isHoliday ? { name: isHoliday.name, type: isHoliday.type } : null,
      canMarkAttendance: !dateUtils.isWeekend(new Date()) && !isHoliday
    }
  });
});

// @desc    Get attendance report for export
// @route   GET /api/attendance/report
// @access  Private (HR/Admin)
export const getAttendanceReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, department, format = 'json' } = req.query;
  
  let query = {};
  
  // Add date range filter
  if (startDate || endDate) {
    query = { ...query, ...searchUtils.createDateRangeFilter(startDate, endDate, 'date') };
  }
  
  // Add department filter
  if (department) {
    const employees = await Employee.find({ department }).select('_id');
    query.employee = { $in: employees.map(emp => emp._id) };
  }
  
  const attendanceData = await Attendance.find(query)
    .populate({
      path: 'employee',
      select: 'employeeCode user designation department',
      populate: [
        { path: 'user', select: 'name email' },
        { path: 'department', select: 'name' }
      ]
    })
    .sort({ date: -1 });
  
  // Log the export
  dataLogger.export('Attendance Report', req.user._id, req.ip, attendanceData.length);
  
  if (format === 'csv') {
    // Convert to CSV format
    const csv = convertToCSV(attendanceData);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance-report.csv');
    return res.send(csv);
  }
  
  res.status(200).json({
    success: true,
    data: attendanceData,
    summary: {
      totalRecords: attendanceData.length,
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate }
    }
  });
});

// Helper function to convert data to CSV
const convertToCSV = (data) => {
  const headers = [
    'Date',
    'Employee Code',
    'Employee Name',
    'Department',
    'Check In',
    'Check Out',
    'Status',
    'Working Hours',
    'Overtime Hours'
  ];
  
  let csv = headers.join(',') + '\n';
  
  data.forEach(record => {
    const row = [
      dateUtils.formatDate(record.date, 'YYYY-MM-DD'),
      record.employee.employeeCode,
      record.employee.user.name,
      record.employee.department?.name || '',
      record.checkIn ? dateUtils.formatDate(record.checkIn, 'HH:mm:ss') : '',
      record.checkOut ? dateUtils.formatDate(record.checkOut, 'HH:mm:ss') : '',
      record.status,
      record.workingHours || 0,
      record.overtimeHours || 0
    ];
    csv += row.join(',') + '\n';
  });
  
  return csv;
};

export default {
  markAttendance,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  createManualAttendance,
  deleteAttendance,
  getAttendanceSummary,
  getTodayAttendance,
  getAttendanceReport
};