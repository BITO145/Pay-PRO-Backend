import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import logger from '../config/logger.js';

// @desc    Create new department
// @route   POST /api/departments
// @access  Admin/HR
export const createDepartment = async (req, res) => {
  try {
      const { name, description, budget } = req.body;
    const headOfDepartment = req.body.headOfDepartment || req.body.head || null;

      // Check if department with same name exists
      const existingDept = await Department.findOne({
        name: { $regex: new RegExp('^' + name + '$', 'i') }
      });

      if (existingDept) {
        return res.status(400).json({
          success: false,
          error: 'Department with this name already exists'
        });
      }

    // Validate headOfDepartment if provided
    if (headOfDepartment) {
      const headEmployee = await Employee.findById(headOfDepartment);
      if (!headEmployee) {
        return res.status(404).json({
          success: false,
          error: 'Selected department head not found'
        });
      }
    }

      const department = new Department({
        name,
        description,
        headOfDepartment,
        budget,
        createdBy: req.user._id
      });

    await department.save();

  // Populate head of department details
    await department.populate({
      path: 'headOfDepartment',
      select: 'employeeCode user',
      populate: { path: 'user', select: 'name email' }
    });

      logger.info(`Department created successfully`, {
        departmentId: department._id,
        name: department.name,
        createdBy: req.user._id
      });

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department
    });

  } catch (error) {
    logger.error('Error in createDepartment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create department'
    });
  }
};

// @desc    Get all departments
// @route   GET /api/departments
// @access  All authenticated users
export const getDepartments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status = 'all',
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (status !== 'all') {
      filter.isActive = status === 'active';
    }

    if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const departments = await Department.find(filter)
      .populate({
        path: 'headOfDepartment',
        select: 'employeeCode user',
        populate: { path: 'user', select: 'name email' }
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Department.countDocuments(filter);

    // Get employee count for each department
    const departmentsWithStats = await Promise.all(
      departments.map(async (dept) => {
        const employeeCount = await Employee.countDocuments({ 
          department: dept._id,
          status: 'active'
        });
        
        return {
          ...dept.toObject(),
          employeeCount
        };
      })
    );

    res.status(200).json({
      success: true,
      data: departmentsWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Error in getDepartments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments'
    });
  }
};

// @desc    Get department by ID
// @route   GET /api/departments/:id
// @access  All authenticated users
export const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id)
      .populate({
        path: 'headOfDepartment',
        select: 'employeeCode user position',
        populate: { path: 'user', select: 'name email' }
      })

    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    // Get department employees
    const employees = await Employee.find({ 
      department: id,
      isActive: true 
    })
    .select('employeeCode user position dateOfJoining isActive')
    .populate({ path: 'user', select: 'name email' });

    // Get department statistics
    const stats = {
      totalEmployees: employees.length,
      activeEmployees: employees.length,
      positions: [...new Set(employees.map(emp => emp.position))],
      budgetUtilization: department.budget ? 
        (employees.length * 50000 / department.budget * 100).toFixed(2) : 0 // Example calculation
    };

    res.status(200).json({
      success: true,
      data: {
        ...department.toObject(),
        employees,
        stats
      }
    });

  } catch (error) {
    logger.error('Error in getDepartmentById:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch department'
    });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Admin/HR
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find existing department
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

      // Check if name conflicts with other departments
      if (updates.name) {
        const conflictingDept = await Department.findOne({
          _id: { $ne: id },
          name: { $regex: new RegExp('^' + updates.name + '$', 'i') }
        });
        if (conflictingDept) {
          return res.status(400).json({
            success: false,
            error: 'Department with this name already exists'
          });
        }
      }

    // Normalize and validate new headOfDepartment if provided
    if (updates.head || updates.headOfDepartment) {
      updates.headOfDepartment = updates.headOfDepartment || updates.head;
      delete updates.head;
      const headEmployee = await Employee.findById(updates.headOfDepartment);
      if (!headEmployee) {
        return res.status(404).json({
          success: false,
          error: 'Selected department head not found'
        });
      }
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate({
      path: 'headOfDepartment',
      select: 'employeeCode user',
      populate: { path: 'user', select: 'name email' }
    })

    logger.info(`Department updated successfully`, {
      departmentId: id,
      updatedBy: req.user._id,
      updates: Object.keys(updates)
    });

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: updatedDepartment
    });

  } catch (error) {
    logger.error('Error in updateDepartment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update department'
    });
  }
};

// @desc    Toggle department status
// @route   PATCH /api/departments/:id/toggle-status
// @access  Admin/HR
export const toggleDepartmentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    // Check if department has active employees
    if (department.isActive) {
      const activeEmployees = await Employee.countDocuments({
        department: id,
        isActive: true
      });

      if (activeEmployees > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot deactivate department with ${activeEmployees} active employees`
        });
      }
    }

    department.isActive = !department.isActive;
    await department.save();

    logger.info(`Department status toggled`, {
      departmentId: id,
      newStatus: department.isActive ? 'active' : 'inactive',
      updatedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: `Department ${department.isActive ? 'activated' : 'deactivated'} successfully`,
      data: department
    });

  } catch (error) {
    logger.error('Error in toggleDepartmentStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle department status'
    });
  }
};

// @desc    Get department employees
// @route   GET /api/departments/:id/employees
// @access  All authenticated users
export const getDepartmentEmployees = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      limit = 10,
      search,
      position,
      status = 'active'
    } = req.query;

    // Check if department exists
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    // Build filter
    const filter = { department: id };

    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }

    if (position) {
      filter.position = { $regex: position, $options: 'i' };
    }

    if (search) {
      filter.$or = [
        { employeeCode: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } }
      ];
      // Note: searching nested user.name requires a $lookup or denormalized field; keeping search to employeeCode/position for now
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const employees = await Employee.find(filter)
      .select('employeeCode user position dateOfJoining isActive')
      .populate({ path: 'user', select: 'name email' })
      .sort({ employeeCode: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Employee.countDocuments(filter);

    // Get department employee statistics
    const stats = await Employee.aggregate([
      { $match: { department: department._id } },
      {
        $group: {
          _id: null,
          totalEmployees: { $sum: 1 },
          activeEmployees: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          positions: { $addToSet: '$position' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: employees,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      stats: stats[0] || {
        totalEmployees: 0,
        activeEmployees: 0,
        positions: []
      },
      department: {
        id: department._id,
        name: department.name
      }
    });

  } catch (error) {
    logger.error('Error in getDepartmentEmployees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch department employees'
    });
  }
};

// @desc    Get department statistics
// @route   GET /api/departments/stats
// @access  Admin/HR
export const getDepartmentStats = async (req, res) => {
  try {
    // Overall department statistics
    const totalDepartments = await Department.countDocuments();
    const activeDepartments = await Department.countDocuments({ isActive: true });

    // Department-wise employee count
    const departmentStats = await Department.aggregate([
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
          isActive: 1,
          budget: 1,
          totalEmployees: { $size: '$employees' },
          activeEmployees: {
            $size: {
              $filter: {
                input: '$employees',
                cond: { $eq: ['$$this.isActive', true] }
              }
            }
          }
        }
      },
      { $sort: { activeEmployees: -1 } }
    ]);

    // Budget utilization (example calculation)
    const budgetStats = departmentStats.map(dept => ({
      ...dept,
      budgetUtilization: dept.budget ? 
        ((dept.activeEmployees * 50000) / dept.budget * 100).toFixed(2) : 0
    }));

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalDepartments,
          activeDepartments,
          inactiveDepartments: totalDepartments - activeDepartments
        },
        departmentBreakdown: budgetStats,
        topDepartments: budgetStats
          .filter(dept => dept.isActive)
          .slice(0, 5)
      }
    });

  } catch (error) {
    logger.error('Error in getDepartmentStats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch department statistics'
    });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Admin only
export const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    // Check if department has employees
    const employeeCount = await Employee.countDocuments({ department: id });
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete department with ${employeeCount} employees. Please reassign or remove employees first.`
      });
    }

    await Department.findByIdAndDelete(id);

    logger.info(`Department deleted successfully`, {
      departmentId: id,
      departmentName: department.name,
      deletedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deleteDepartment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete department'
    });
  }
};