import express from 'express';
import {
  getDashboardStats,
  getRecentActivities,
  getAttendanceOverview,
  getDepartmentOverview
} from '../controllers/dashboardController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Dashboard routes
router.get('/stats', getDashboardStats);
router.get('/activities', getRecentActivities);
router.get('/attendance-overview', getAttendanceOverview);
router.get('/department-overview', getDepartmentOverview);

export default router;