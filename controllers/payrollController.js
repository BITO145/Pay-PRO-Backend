import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import { generateReference } from '../utils/helpers.js';
import logger from '../config/logger.js';
import moment from 'moment';

// @desc    Generate payroll for an employee
// @route   POST /api/payroll/generate/:employeeId
// @access  Admin/HR
export const generatePayroll = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { 
      payPeriodStart, 
      payPeriodEnd, 
      basicSalary, 
      allowances, 
      deductions, 
      overtimeHours,
      bonuses,
      notes 
    } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Check if payroll already exists for this period
    const existingPayroll = await Payroll.findOne({
      employee: employeeId,
      payPeriodStart: new Date(payPeriodStart),
      payPeriodEnd: new Date(payPeriodEnd)
    });

    if (existingPayroll) {
      return res.status(400).json({
        success: false,
        error: 'Payroll already exists for this period'
      });
    }

    // Calculate totals
    const totalAllowances = allowances?.reduce((sum, allowance) => sum + allowance.amount, 0) || 0;
    const totalDeductions = deductions?.reduce((sum, deduction) => sum + deduction.amount, 0) || 0;
    const totalBonuses = bonuses?.reduce((sum, bonus) => sum + bonus.amount, 0) || 0;
    
    // Calculate overtime pay (assuming 1.5x hourly rate for overtime)
    const hourlyRate = basicSalary / 160; // Assuming 160 working hours per month
    const overtimePay = (overtimeHours || 0) * hourlyRate * 1.5;

    const grossSalary = basicSalary + totalAllowances + overtimePay + totalBonuses;
    const netSalary = grossSalary - totalDeductions;

    // Generate payroll number
    const payrollNumber = generateReference('PAY');

    const payroll = new Payroll({
      employee: employeeId,
      payrollNumber,
      payPeriodStart: new Date(payPeriodStart),
      payPeriodEnd: new Date(payPeriodEnd),
      basicSalary,
      allowances: allowances || [],
      deductions: deductions || [],
      bonuses: bonuses || [],
      overtimeHours: overtimeHours || 0,
      overtimePay,
      grossSalary,
      netSalary,
      notes,
      generatedBy: req.user._id
    });

    await payroll.save();

    // Populate employee details
    await payroll.populate('employee', 'name email employeeId');

    logger.info(`Payroll generated successfully`, {
      payrollId: payroll._id,
      employeeId,
      payrollNumber,
      netSalary,
      generatedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Payroll generated successfully',
      data: payroll
    });

  } catch (error) {
    logger.error('Error in generatePayroll:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate payroll'
    });
  }
};

// @desc    Get payrolls with filtering
// @route   GET /api/payroll
// @access  Admin/HR
export const getPayrolls = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee,
      department,
      month,
      year,
      status,
      search,
      sortBy = 'payPeriodEnd',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (employee) {
      filter.employee = employee;
    }

    if (month && year) {
      const startDate = moment(`${year}-${month}-01`).startOf('month').toDate();
      const endDate = moment(startDate).endOf('month').toDate();
      filter.payPeriodStart = { $gte: startDate, $lte: endDate };
    } else if (year) {
      const startDate = moment(`${year}-01-01`).startOf('year').toDate();
      const endDate = moment(startDate).endOf('year').toDate();
      filter.payPeriodStart = { $gte: startDate, $lte: endDate };
    }

    if (status) {
      filter.status = status;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = Payroll.find(filter)
      .populate('employee', 'name email employeeId department')
      .populate('generatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Add department filter if specified
    if (department) {
      query = query.populate({
        path: 'employee',
        match: { department: department },
        select: 'name email employeeId department'
      });
    }

    // Add search functionality
    if (search) {
      const employeeIds = await Employee.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } }
        ]
      }).distinct('_id');

      filter.$or = [
        { employee: { $in: employeeIds } },
        { payrollNumber: { $regex: search, $options: 'i' } }
      ];

      query = Payroll.find(filter)
        .populate('employee', 'name email employeeId department')
        .populate('generatedBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
    }

    const payrolls = await query;
    const total = await Payroll.countDocuments(filter);

    // Calculate summary statistics
    const summary = await Payroll.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalGrossSalary: { $sum: '$grossSalary' },
          totalNetSalary: { $sum: '$netSalary' },
          totalDeductions: { $sum: { $sum: '$deductions.amount' } },
          averageNetSalary: { $avg: '$netSalary' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: payrolls,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      summary: summary[0] || {
        totalGrossSalary: 0,
        totalNetSalary: 0,
        totalDeductions: 0,
        averageNetSalary: 0,
        count: 0
      }
    });

  } catch (error) {
    logger.error('Error in getPayrolls:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payrolls'
    });
  }
};

// @desc    Get payroll by ID
// @route   GET /api/payroll/:id
// @access  Admin/HR/Employee (own payroll)
export const getPayrollById = async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate('employee', 'name email employeeId department position')
      .populate('generatedBy', 'name email');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        error: 'Payroll not found'
      });
    }

    // Check if user can access this payroll
    if (req.user.role === 'employee' && payroll.employee._id.toString() !== req.user.employee?.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: payroll
    });

  } catch (error) {
    logger.error('Error in getPayrollById:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payroll'
    });
  }
};

// @desc    Update payroll
// @route   PUT /api/payroll/:id
// @access  Admin/HR
export const updatePayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find existing payroll
    const payroll = await Payroll.findById(id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        error: 'Payroll not found'
      });
    }

    // Prevent updates to processed payrolls
    if (payroll.status === 'processed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update processed payroll'
      });
    }

    // Recalculate totals if salary components are updated
    if (updates.basicSalary || updates.allowances || updates.deductions || 
        updates.bonuses || updates.overtimeHours) {
      
      const basicSalary = updates.basicSalary || payroll.basicSalary;
      const allowances = updates.allowances || payroll.allowances;
      const deductions = updates.deductions || payroll.deductions;
      const bonuses = updates.bonuses || payroll.bonuses;
      const overtimeHours = updates.overtimeHours || payroll.overtimeHours;

      const totalAllowances = allowances.reduce((sum, allowance) => sum + allowance.amount, 0);
      const totalDeductions = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
      const totalBonuses = bonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
      
      const hourlyRate = basicSalary / 160;
      const overtimePay = overtimeHours * hourlyRate * 1.5;

      updates.overtimePay = overtimePay;
      updates.grossSalary = basicSalary + totalAllowances + overtimePay + totalBonuses;
      updates.netSalary = updates.grossSalary - totalDeductions;
    }

    const updatedPayroll = await Payroll.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('employee', 'name email employeeId')
     .populate('generatedBy', 'name email');

    logger.info(`Payroll updated successfully`, {
      payrollId: id,
      updatedBy: req.user._id,
      updates: Object.keys(updates)
    });

    res.status(200).json({
      success: true,
      message: 'Payroll updated successfully',
      data: updatedPayroll
    });

  } catch (error) {
    logger.error('Error in updatePayroll:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payroll'
    });
  }
};

// @desc    Process payroll (mark as paid)
// @route   PATCH /api/payroll/:id/process
// @access  Admin/HR
export const processPayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;

    const payroll = await Payroll.findById(id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        error: 'Payroll not found'
      });
    }

    if (payroll.status === 'processed') {
      return res.status(400).json({
        success: false,
        error: 'Payroll is already processed'
      });
    }

    payroll.status = 'processed';
    payroll.paymentDate = new Date();
    payroll.paymentMethod = paymentMethod;
    payroll.transactionId = transactionId;
    if (notes) payroll.notes = notes;

    await payroll.save();

    logger.info(`Payroll processed successfully`, {
      payrollId: id,
      processedBy: req.user._id,
      paymentMethod,
      netSalary: payroll.netSalary
    });

    res.status(200).json({
      success: true,
      message: 'Payroll processed successfully',
      data: payroll
    });

  } catch (error) {
    logger.error('Error in processPayroll:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process payroll'
    });
  }
};

// @desc    Get employee payroll history
// @route   GET /api/payroll/employee/:employeeId/history
// @access  Admin/HR/Employee (own history)
export const getEmployeePayrollHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { page = 1, limit = 10, year } = req.query;

    // Check access permissions
    if (req.user.role === 'employee' && req.user.employee?.toString() !== employeeId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Build filter
    const filter = { employee: employeeId };
    
    if (year) {
      const startDate = moment(`${year}-01-01`).startOf('year').toDate();
      const endDate = moment(startDate).endOf('year').toDate();
      filter.payPeriodStart = { $gte: startDate, $lte: endDate };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payrolls = await Payroll.find(filter)
      .populate('employee', 'name email employeeId')
      .sort({ payPeriodEnd: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payroll.countDocuments(filter);

    // Calculate yearly summary
    const yearlyStats = await Payroll.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $year: '$payPeriodEnd' },
          totalGross: { $sum: '$grossSalary' },
          totalNet: { $sum: '$netSalary' },
          totalDeductions: { $sum: { $sum: '$deductions.amount' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: payrolls,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      yearlyStats
    });

  } catch (error) {
    logger.error('Error in getEmployeePayrollHistory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payroll history'
    });
  }
};

// @desc    Generate payroll report
// @route   GET /api/payroll/reports/summary
// @access  Admin/HR
export const getPayrollReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      department, 
      format = 'json' 
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.payPeriodStart = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: dateFilter }
    ];

    // Add department filter if specified
    if (department) {
      pipeline.push(
        {
          $lookup: {
            from: 'employees',
            localField: 'employee',
            foreignField: '_id',
            as: 'employeeData'
          }
        },
        {
          $match: {
            'employeeData.department': department
          }
        }
      );
    }

    // Add grouping and calculations
    pipeline.push(
      {
        $group: {
          _id: null,
          totalEmployees: { $addToSet: '$employee' },
          totalGrossSalary: { $sum: '$grossSalary' },
          totalNetSalary: { $sum: '$netSalary' },
          totalDeductions: { $sum: { $sum: '$deductions.amount' } },
          totalAllowances: { $sum: { $sum: '$allowances.amount' } },
          totalOvertimePay: { $sum: '$overtimePay' },
          averageGrossSalary: { $avg: '$grossSalary' },
          averageNetSalary: { $avg: '$netSalary' },
          payrollCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          totalEmployees: { $size: '$totalEmployees' },
          totalGrossSalary: 1,
          totalNetSalary: 1,
          totalDeductions: 1,
          totalAllowances: 1,
          totalOvertimePay: 1,
          averageGrossSalary: 1,
          averageNetSalary: 1,
          payrollCount: 1
        }
      }
    );

    const [summary] = await Payroll.aggregate(pipeline);

    // Get department-wise breakdown
    const departmentBreakdown = await Payroll.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: 'employees',
          localField: 'employee',
          foreignField: '_id',
          as: 'employeeData'
        }
      },
      { $unwind: '$employeeData' },
      {
        $lookup: {
          from: 'departments',
          localField: 'employeeData.department',
          foreignField: '_id',
          as: 'departmentData'
        }
      },
      { $unwind: '$departmentData' },
      {
        $group: {
          _id: '$departmentData._id',
          departmentName: { $first: '$departmentData.name' },
          employeeCount: { $addToSet: '$employee' },
          totalGrossSalary: { $sum: '$grossSalary' },
          totalNetSalary: { $sum: '$netSalary' },
          averageSalary: { $avg: '$netSalary' }
        }
      },
      {
        $project: {
          departmentName: 1,
          employeeCount: { $size: '$employeeCount' },
          totalGrossSalary: 1,
          totalNetSalary: 1,
          averageSalary: 1
        }
      }
    ]);

    const reportData = {
      summary: summary || {
        totalEmployees: 0,
        totalGrossSalary: 0,
        totalNetSalary: 0,
        totalDeductions: 0,
        totalAllowances: 0,
        totalOvertimePay: 0,
        averageGrossSalary: 0,
        averageNetSalary: 0,
        payrollCount: 0
      },
      departmentBreakdown,
      period: {
        startDate,
        endDate
      },
      generatedAt: new Date().toISOString(),
      generatedBy: req.user._id
    };

    res.status(200).json({
      success: true,
      data: reportData
    });

  } catch (error) {
    logger.error('Error in getPayrollReport:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate payroll report'
    });
  }
};

// @desc    Delete payroll
// @route   DELETE /api/payroll/:id
// @access  Admin only
export const deletePayroll = async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        error: 'Payroll not found'
      });
    }

    // Prevent deletion of processed payrolls
    if (payroll.status === 'processed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete processed payroll'
      });
    }

    await Payroll.findByIdAndDelete(id);

    logger.info(`Payroll deleted successfully`, {
      payrollId: id,
      deletedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Payroll deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deletePayroll:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete payroll'
    });
  }
};