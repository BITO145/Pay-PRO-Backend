import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import AuditLog from '../models/AuditLog.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
export const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get total employees
  const totalEmployees = await Employee.countDocuments({ status: 'active' });
  
  // Get employees from last month
  const lastMonthEmployees = await Employee.countDocuments({
    status: 'active',
    createdAt: { $lt: startOfMonth }
  });

  // Calculate employee growth
  const employeeGrowth = lastMonthEmployees > 0 
    ? Math.round(((totalEmployees - lastMonthEmployees) / lastMonthEmployees) * 100)
    : 0;

  // Get today's attendance
  const todayAttendance = await Attendance.find({
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    }
  });

  const presentToday = todayAttendance.filter(att => att.status === 'present').length;
  const attendanceRate = totalEmployees > 0 
    ? Math.round((presentToday / totalEmployees) * 100)
    : 0;

  // Get leave data
  const todayLeaves = await Leave.find({
    status: 'approved',
    startDate: { $lte: today },
    endDate: { $gte: today }
  }).populate('employee', 'firstName lastName');

  const onLeave = todayLeaves.length;
  
  // Break down leaves by type
  const leaveBreakdown = {
    sick: todayLeaves.filter(leave => leave.type === 'sick').length,
    vacation: todayLeaves.filter(leave => leave.type === 'vacation').length,
    personal: todayLeaves.filter(leave => leave.type === 'personal').length
  };

  // Calculate absent (total - present - on leave)
  const absent = Math.max(0, totalEmployees - presentToday - onLeave);
  const absenceRate = totalEmployees > 0 
    ? Math.round((absent / totalEmployees) * 100)
    : 0;

  res.status(200).json({
    success: true,
    data: {
      totalEmployees,
      employeeGrowth,
      presentToday,
      attendanceRate,
      onLeave,
      leaveBreakdown,
      absent,
      absenceRate
    }
  });
});

// @desc    Get recent activities
// @route   GET /api/dashboard/activities
// @access  Private
export const getRecentActivities = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  // Get recent audit logs
  const activities = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'name email')
    .select('action targetModel createdAt user');

  const formattedActivities = activities.map(activity => ({
    _id: activity._id,
    type: activity.targetModel?.toLowerCase() || 'general',
    action: activity.action,
    description: `${activity.action} in ${activity.targetModel}`,
    createdAt: activity.createdAt,
    user: activity.user
  }));

  res.status(200).json({
    success: true,
    data: formattedActivities
  });
});

// @desc    Get attendance overview
// @route   GET /api/dashboard/attendance-overview
// @access  Private
export const getAttendanceOverview = asyncHandler(async (req, res) => {
  const { period = '7d' } = req.query;
  
  let days = 7;
  if (period === '30d') days = 30;
  if (period === '90d') days = 90;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const attendanceData = [];
  const totalEmployees = await Employee.countDocuments({ status: 'active' });

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayAttendance = await Attendance.find({
      date: {
        $gte: date,
        $lt: nextDate
      }
    });

    const presentCount = dayAttendance.filter(att => att.status === 'present').length;
    const percentage = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

    attendanceData.push({
      date: date.toISOString().split('T')[0],
      present: presentCount,
      total: totalEmployees,
      percentage
    });
  }

  res.status(200).json({
    success: true,
    data: attendanceData
  });
});

// @desc    Get department overview
// @route   GET /api/dashboard/department-overview
// @access  Private
export const getDepartmentOverview = asyncHandler(async (req, res) => {
  const departments = await Department.aggregate([
    {
      $lookup: {
        from: 'employees',
        localField: '_id',
        foreignField: 'department',
        as: 'employees'
      }
    },
    {
      $project: {
        name: 1,
        description: 1,
        employeeCount: { $size: '$employees' },
        status: 1
      }
    },
    {
      $sort: { employeeCount: -1 }
    }
  ]);

  const totalEmployees = await Employee.countDocuments({ status: 'active' });

  res.status(200).json({
    success: true,
    data: {
      departments,
      totalEmployees
    }
  });
});

export default {
  getDashboardStats,
  getRecentActivities,
  getAttendanceOverview,
  getDepartmentOverview
};