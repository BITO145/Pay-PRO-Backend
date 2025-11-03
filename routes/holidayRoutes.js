import express from 'express';
import {
  createHoliday,
  getHolidays,
  getHolidayById,
  updateHoliday,
  getUpcomingHolidays,
  getHolidayCalendar,
  getHolidayStats,
  bulkImportHolidays,
  deleteHoliday
} from '../controllers/holidayController.js';
import { protect, restrictTo, isHROrAdmin, auditLog } from '../middleware/auth.js';
import { validateHoliday, validateHolidayUpdate } from '../middleware/validation.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get upcoming holidays
router.get('/upcoming', 
  getUpcomingHolidays
);

// Get holiday calendar
router.get('/calendar', 
  getHolidayCalendar
);

// Get holiday statistics
router.get('/stats', 
  isHROrAdmin,
  getHolidayStats
);

// Bulk import holidays
router.post('/bulk-import', 
  isHROrAdmin,
  auditLog('HOLIDAY_BULK_IMPORT'),
  bulkImportHolidays
);

// Create holiday
router.post('/', 
  isHROrAdmin,
  validateHoliday,
  auditLog('HOLIDAY_CREATE'),
  createHoliday
);

// Get all holidays
router.get('/', 
  getHolidays
);

// Get holiday by ID
router.get('/:id', 
  getHolidayById
);

// Update holiday
router.put('/:id', 
  isHROrAdmin,
  validateHolidayUpdate,
  auditLog('HOLIDAY_UPDATE'),
  updateHoliday
);

// Delete holiday
router.delete('/:id', 
  isHROrAdmin,
  auditLog('HOLIDAY_DELETE'),
  deleteHoliday
);

export default router;