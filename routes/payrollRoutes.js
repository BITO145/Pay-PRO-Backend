import express from 'express';
import {
  generatePayroll,
  getPayrolls,
  getPayrollById,
  updatePayroll,
  processPayroll,
  getEmployeePayrollHistory,
  getPayrollReport,
  deletePayroll,
  initiateBulkPayout,
  getPayoutStatus,
  getAccountBalance
} from '../controllers/payrollController.js';
import { protect, restrictTo, isHROrAdmin, canAccessEmployee, auditLog } from '../middleware/auth.js';
import { validatePayroll, validatePayrollUpdate } from '../middleware/validation.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Generate payroll for an employee
router.post('/generate/:employeeId', 
  isHROrAdmin,
  validatePayroll,
  auditLog('PAYROLL_GENERATE'),
  generatePayroll
);

// Get payrolls with filtering
router.get('/', 
  isHROrAdmin,
  getPayrolls
);

// Get payroll reports
router.get('/reports/summary', 
  isHROrAdmin,
  getPayrollReport
);

// Get employee payroll history
router.get('/employee/:employeeId/history', 
  canAccessEmployee,
  getEmployeePayrollHistory
);

// Get payroll by ID
router.get('/:id', 
  getPayrollById
);

// Update payroll
router.put('/:id', 
  isHROrAdmin,
  validatePayrollUpdate,
  auditLog('PAYROLL_UPDATE'),
  updatePayroll
);

// Process payroll (mark as paid)
router.patch('/:id/process', 
  isHROrAdmin,
  auditLog('PAYROLL_PROCESS'),
  processPayroll
);

// Delete payroll
router.delete('/:id', 
  restrictTo('admin'),
  auditLog('PAYROLL_DELETE'),
  deletePayroll
);

// RazorpayX Payout Routes
// Initiate bulk payout
router.post('/bulk-payout', 
  restrictTo('admin'),
  auditLog('BULK_PAYOUT_INITIATE'),
  initiateBulkPayout
);

// Get payout status
router.get('/payout-status/:payoutId', 
  isHROrAdmin,
  getPayoutStatus
);

// Get account balance
router.get('/account/balance', 
  restrictTo('admin'),
  getAccountBalance
);

export default router;