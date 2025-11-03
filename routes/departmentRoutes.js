import express from 'express';
import {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  toggleDepartmentStatus,
  getDepartmentEmployees,
  getDepartmentStats,
  deleteDepartment
} from '../controllers/departmentController.js';
import { protect, restrictTo, isHROrAdmin, auditLog } from '../middleware/auth.js';
import { validateDepartment, validateDepartmentUpdate } from '../middleware/validation.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get department statistics
router.get('/stats', 
  isHROrAdmin,
  getDepartmentStats
);

// Create department
router.post('/', 
  isHROrAdmin,
  validateDepartment,
  auditLog('DEPARTMENT_CREATE'),
  createDepartment
);

// Get all departments
router.get('/', 
  getDepartments
);

// Get department by ID
router.get('/:id', 
  getDepartmentById
);

// Update department
router.put('/:id', 
  isHROrAdmin,
  validateDepartmentUpdate,
  auditLog('DEPARTMENT_UPDATE'),
  updateDepartment
);

// Toggle department status
router.patch('/:id/toggle-status', 
  isHROrAdmin,
  auditLog('DEPARTMENT_STATUS_TOGGLE'),
  toggleDepartmentStatus
);

// Get department employees
router.get('/:id/employees', 
  getDepartmentEmployees
);

// Delete department
router.delete('/:id', 
  restrictTo('admin'),
  auditLog('DEPARTMENT_DELETE'),
  deleteDepartment
);

export default router;