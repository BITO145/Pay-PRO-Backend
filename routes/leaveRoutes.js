import express from 'express';
import {
  applyLeave,
  getLeaves,
  getLeave,
  updateLeaveStatus,
  updateLeave,
  cancelLeave,
  getLeaveBalance,
  getLeaveCalendar,
  getLeaveStatistics
} from '../controllers/leaveController.js';
import { protect, restrictTo, isHROrAdmin, auditLog } from '../middleware/auth.js';
import { validate, leaveSchemas } from '../middleware/validation.js';
import { uploadLeaveAttachment, handleMulterError } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Employee routes
router.post('/', 
  restrictTo('employee'),
  validate(leaveSchemas.apply),
  auditLog('apply_leave', 'Leave'),
  applyLeave
);

// Common routes
router.get('/', 
  auditLog('get_leave_applications', 'Leave'),
  getLeaves
);

router.get('/balance/:employeeId?', 
  auditLog('get_leave_balance', 'Leave'),
  getLeaveBalance
);

router.get('/calendar', 
  auditLog('get_leave_calendar', 'Leave'),
  getLeaveCalendar
);

router.get('/statistics', 
  isHROrAdmin,
  auditLog('get_leave_statistics', 'Leave'),
  getLeaveStatistics
);

router.get('/:id', 
  auditLog('get_leave_details', 'Leave'),
  getLeave
);

// Employee can update their own pending leaves
router.put('/:id', 
  restrictTo('employee'),
  validate(leaveSchemas.apply),
  auditLog('update_leave_application', 'Leave'),
  updateLeave
);

// Employee can cancel their own leaves
router.delete('/:id', 
  restrictTo('employee'),
  auditLog('cancel_leave_application', 'Leave'),
  cancelLeave
);

// HR/Admin routes
router.put('/:id/status', 
  isHROrAdmin,
  validate(leaveSchemas.updateStatus),
  auditLog('update_leave_status', 'Leave'),
  updateLeaveStatus
);

// Upload leave attachments
router.post('/:id/attachments', 
  uploadLeaveAttachment.array('attachments', 3),
  handleMulterError,
  auditLog('upload_leave_attachments', 'Leave'),
  async (req, res) => {
    try {
      const Leave = (await import('../models/Leave.js')).default;
      
      const leave = await Leave.findById(req.params.id);
      if (!leave) {
        return res.status(404).json({
          success: false,
          message: 'Leave application not found'
        });
      }
      
      // Check if user can upload attachments to this leave
      if (req.user.role === 'employee') {
        const Employee = (await import('../models/Employee.js')).default;
        const employee = await Employee.findOne({ user: req.user._id });
        if (!employee || leave.employee.toString() !== employee._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'You can only upload attachments to your own leave applications'
          });
        }
      }
      
      // Add uploaded files to leave attachments
      const newAttachments = req.files.map(file => ({
        fileName: file.originalname,
        fileUrl: file.path,
        uploadedAt: new Date()
      }));
      
      leave.attachments.push(...newAttachments);
      await leave.save();
      
      res.status(200).json({
        success: true,
        message: 'Attachments uploaded successfully',
        data: newAttachments
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error uploading attachments',
        error: error.message
      });
    }
  }
);

export default router;