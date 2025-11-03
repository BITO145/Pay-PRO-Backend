import express from 'express';
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  toggleAnnouncementStatus,
  getUnreadAnnouncements,
  markAsRead,
  getAnnouncementStats,
  deleteAnnouncement
} from '../controllers/announcementController.js';
import { protect, restrictTo, isHROrAdmin, auditLog } from '../middleware/auth.js';
import { validateAnnouncement, validateAnnouncementUpdate } from '../middleware/validation.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get unread announcements for current user
router.get('/unread', 
  getUnreadAnnouncements
);

// Get announcement statistics
router.get('/stats', 
  isHROrAdmin,
  getAnnouncementStats
);

// Create announcement
router.post('/', 
  isHROrAdmin,
  validateAnnouncement,
  auditLog('ANNOUNCEMENT_CREATE'),
  createAnnouncement
);

// Get all announcements
router.get('/', 
  getAnnouncements
);

// Get announcement by ID
router.get('/:id', 
  getAnnouncementById
);

// Update announcement
router.put('/:id', 
  isHROrAdmin,
  validateAnnouncementUpdate,
  auditLog('ANNOUNCEMENT_UPDATE'),
  updateAnnouncement
);

// Toggle announcement status
router.patch('/:id/toggle-status', 
  isHROrAdmin,
  auditLog('ANNOUNCEMENT_STATUS_TOGGLE'),
  toggleAnnouncementStatus
);

// Mark announcement as read
router.patch('/:id/read', 
  markAsRead
);

// Delete announcement
router.delete('/:id', 
  restrictTo('admin'),
  auditLog('ANNOUNCEMENT_DELETE'),
  deleteAnnouncement
);

export default router;