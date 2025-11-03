import express from 'express';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeDashboard,
  getEmployeeStatistics,
  bulkImportEmployees
} from '../controllers/employeeController.js';
import { protect, restrictTo, isHROrAdmin, canAccessEmployee, auditLog } from '../middleware/auth.js';
import { validate, employeeSchemas } from '../middleware/validation.js';
import { uploadDocument, handleMulterError } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get all employees (HR/Admin only)
router.get('/', 
  isHROrAdmin,
  auditLog('get_employees_list', 'Employee'),
  getEmployees
);

// Get employee statistics (HR/Admin only)
router.get('/statistics', 
  isHROrAdmin,
  auditLog('get_employee_statistics', 'Employee'),
  getEmployeeStatistics
);

// Bulk import employees (HR/Admin only)
router.post('/bulk-import', 
  isHROrAdmin,
  auditLog('bulk_import_employees', 'Employee'),
  bulkImportEmployees
);

// Get single employee (HR/Admin or own record)
router.get('/:id', 
  canAccessEmployee,
  auditLog('get_employee_details', 'Employee'),
  getEmployee
);

// Create new employee (HR/Admin only)
router.post('/', 
  isHROrAdmin,
  validate(employeeSchemas.create),
  auditLog('create_employee', 'Employee'),
  createEmployee
);

// Update employee (HR/Admin or own limited fields)
router.put('/:id', 
  canAccessEmployee,
  validate(employeeSchemas.update),
  auditLog('update_employee', 'Employee'),
  updateEmployee
);

// Delete employee (HR/Admin only)
router.delete('/:id', 
  isHROrAdmin,
  auditLog('delete_employee', 'Employee'),
  deleteEmployee
);

// Get employee dashboard data
router.get('/:id/dashboard', 
  canAccessEmployee,
  auditLog('get_employee_dashboard', 'Employee'),
  getEmployeeDashboard
);

// Upload employee documents
router.post('/:id/documents', 
  canAccessEmployee,
  uploadDocument.array('documents', 5),
  handleMulterError,
  auditLog('upload_employee_documents', 'Employee'),
  async (req, res) => {
    try {
      const Employee = (await import('../models/Employee.js')).default;
      
      const employee = await Employee.findById(req.params.id);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
      
      // Add uploaded files to employee documents
      const newDocuments = req.files.map(file => ({
        docType: req.body.docType || 'other',
        fileName: file.originalname,
        fileUrl: file.path,
        uploadedAt: new Date()
      }));
      
      employee.documents.push(...newDocuments);
      await employee.save();
      
      res.status(200).json({
        success: true,
        message: 'Documents uploaded successfully',
        data: newDocuments
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error uploading documents',
        error: error.message
      });
    }
  }
);

export default router;