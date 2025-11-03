import express from 'express';
import {
  markAttendance,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  createManualAttendance,
  deleteAttendance,
  getAttendanceSummary,
  getTodayAttendance,
  getAttendanceReport
} from '../controllers/attendanceController.js';
import { protect, restrictTo, isHROrAdmin, auditLog } from '../middleware/auth.js';
import { validate, attendanceSchemas } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Employee routes
router.post('/mark', 
  restrictTo('employee'),
  validate(attendanceSchemas.checkIn), // Can be used for both check-in and check-out
  auditLog('mark_attendance', 'Attendance'),
  markAttendance
);

router.get('/today', 
  restrictTo('employee'),
  auditLog('get_today_attendance', 'Attendance'),
  getTodayAttendance
);

// Common routes (accessible by employee for own records, HR/Admin for all)
router.get('/', 
  auditLog('get_attendance_records', 'Attendance'),
  getAttendance
);

router.get('/summary', 
  auditLog('get_attendance_summary', 'Attendance'),
  getAttendanceSummary
);

router.get('/report', 
  isHROrAdmin,
  auditLog('export_attendance_report', 'Attendance'),
  getAttendanceReport
);

router.get('/:id', 
  auditLog('get_attendance_details', 'Attendance'),
  getAttendanceById
);

// HR/Admin only routes
router.post('/manual', 
  isHROrAdmin,
  validate(attendanceSchemas.manualEntry),
  auditLog('create_manual_attendance', 'Attendance'),
  createManualAttendance
);

router.put('/:id', 
  isHROrAdmin,
  validate(attendanceSchemas.manualEntry),
  auditLog('update_attendance', 'Attendance'),
  updateAttendance
);

router.delete('/:id', 
  isHROrAdmin,
  auditLog('delete_attendance', 'Attendance'),
  deleteAttendance
);

export default router;