import Joi from 'joi';

// Generic validation middleware
export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const message = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: message
      });
    }
    
    next();
  };
};

// User validation schemas
export const userSchemas = {
  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'hr', 'employee').default('employee'),
    phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional(),
    address: Joi.string().max(200).trim().empty('').optional()
  }),
  
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50).trim().empty('').optional(),
    phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional(),
    address: Joi.string().max(200).trim().empty('').optional()
  }),
  
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  })
};

// Employee validation schemas
export const employeeSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    // department can be an existing ObjectId or an object to create inline
    department: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
      Joi.object({
        name: Joi.string().min(2).max(100).required(),
        description: Joi.string().max(500).trim().empty('').optional(),
        budget: Joi.number().min(0).optional()
      })
    ).required(),
    designation: Joi.string().min(2).max(50).required(),
    dateOfJoining: Joi.date().required(),
    employmentType: Joi.string().valid('full-time', 'part-time', 'contract', 'intern', 'permanent').default('full-time'),
    workLocation: Joi.string().valid('office', 'remote', 'hybrid').default('office'),
    salary: Joi.object({
      basic: Joi.number().min(0).required(),
      hra: Joi.number().min(0).default(0),
      allowance: Joi.number().min(0).default(0),
      deductions: Joi.number().min(0).default(0),
      providentFund: Joi.number().min(0).default(0),
      professionalTax: Joi.number().min(0).default(0),
      incomeTax: Joi.number().min(0).default(0)
    }).optional(),
    phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional(),
    address: Joi.string().max(200).trim().empty('').optional(),
    personalDetails: Joi.object({
      dateOfBirth: Joi.date().empty('').optional(),
      gender: Joi.string().valid('male', 'female', 'other').trim().empty('').optional(),
      maritalStatus: Joi.string().valid('single', 'married', 'divorced', 'widowed').trim().empty('').optional(),
      bloodGroup: Joi.string().trim().empty('').optional(),
      emergencyContact: Joi.object({
        name: Joi.string().trim().empty('').optional(),
        relationship: Joi.string().trim().empty('').optional(),
        phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional()
      }).optional()
    }).optional(),
    bankDetails: Joi.object({
      accountHolderName: Joi.string().trim().empty('').optional(),
      accountNumber: Joi.string().trim().empty('').optional(),
      bankName: Joi.string().trim().empty('').optional(),
      ifscCode: Joi.string().trim().empty('').optional(),
      upiId: Joi.string().trim().empty('').optional(),
      payoutMethod: Joi.string().valid('bank_account', 'upi').optional()
    }).optional(),
  }),
  
  update: Joi.object({
    department: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
      Joi.object({
        name: Joi.string().min(2).max(100).required(),
        description: Joi.string().max(500).trim().empty('').optional(),
        budget: Joi.number().min(0).optional()
      })
    ),
    designation: Joi.string().min(2).max(50).trim().empty('').optional(),
    employmentType: Joi.string().valid('full-time', 'part-time', 'contract', 'intern', 'permanent').trim().empty('').optional(),
    workLocation: Joi.string().valid('office', 'remote', 'hybrid').trim().empty('').optional(),
    salary: Joi.object({
      basic: Joi.number().min(0),
      hra: Joi.number().min(0),
      allowance: Joi.number().min(0),
      deductions: Joi.number().min(0),
      providentFund: Joi.number().min(0),
      professionalTax: Joi.number().min(0),
      incomeTax: Joi.number().min(0)
    }).optional(),
    phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional(),
    address: Joi.string().max(200).trim().empty('').optional(),
    personalDetails: Joi.object({
      dateOfBirth: Joi.date().empty('').optional(),
      gender: Joi.string().valid('male', 'female', 'other').trim().empty('').optional(),
      maritalStatus: Joi.string().valid('single', 'married', 'divorced', 'widowed').trim().empty('').optional(),
      bloodGroup: Joi.string().trim().empty('').optional(),
      emergencyContact: Joi.object({
        name: Joi.string().trim().empty('').optional(),
        relationship: Joi.string().trim().empty('').optional(),
        phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional()
      }).optional()
    }).optional(),
    bankDetails: Joi.object({
      accountHolderName: Joi.string().trim().empty('').optional(),
      accountNumber: Joi.string().trim().empty('').optional(),
      bankName: Joi.string().trim().empty('').optional(),
      ifscCode: Joi.string().trim().empty('').optional(),
      upiId: Joi.string().trim().empty('').optional(),
      payoutMethod: Joi.string().valid('bank_account', 'upi').optional()
    }).optional()
  })
}

// Department validation schemas
export const departmentSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).trim().empty('').optional(),
    headOfDepartment: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).empty('').optional(),
    budget: Joi.number().min(0)
  }),
  
  update: Joi.object({
    name: Joi.string().min(2).max(100).trim().empty('').optional(),
    description: Joi.string().max(500).trim().empty('').optional(),
    headOfDepartment: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).empty('').optional(),
    budget: Joi.number().min(0),
    isActive: Joi.boolean()
  })
};

// Attendance validation schemas
export const attendanceSchemas = {
  checkIn: Joi.object({
    type: Joi.string().valid('checkin', 'checkout').required(),
    location: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180),
      address: Joi.string().max(200).trim().empty('').optional()
    }),
    notes: Joi.string().max(200).trim().empty('').optional()
  }),
  
  checkOut: Joi.object({
    location: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180),
      address: Joi.string().max(200).trim().empty('').optional()
    }),
    notes: Joi.string().max(200).trim().empty('').optional()
  }),
  
  manual: Joi.object({
    employee: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    date: Joi.date().required(),
    checkIn: Joi.date().required(),
    checkOut: Joi.date().greater(Joi.ref('checkIn')),
    status: Joi.string().valid('present', 'late', 'half-day'),
    notes: Joi.string().max(200).trim().empty('').optional()
  }),
  
  update: Joi.object({
    checkIn: Joi.date().empty('').optional(),
    checkOut: Joi.date().empty('').optional(),
    status: Joi.string().valid('present', 'absent', 'late', 'half-day').trim().empty('').optional(),
    notes: Joi.string().max(200).trim().empty('').optional()
  })
};

// Leave validation schemas
export const leaveSchemas = {
  apply: Joi.object({
    type: Joi.string().valid('sick', 'casual', 'annual', 'maternity', 'paternity', 'emergency').required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().greater(Joi.ref('startDate')).required(),
    reason: Joi.string().min(10).max(500).required(),
    isHalfDay: Joi.boolean().default(false),
    halfDayType: Joi.string().valid('first-half', 'second-half').when('isHalfDay', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
    emergencyContact: Joi.object({
      name: Joi.string().trim().empty('').optional(),
      phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional(),
      relationship: Joi.string().trim().empty('').optional()
    })
  }),
  
  update: Joi.object({
    type: Joi.string().valid('sick', 'casual', 'annual', 'maternity', 'paternity', 'emergency').trim().empty('').optional(),
    startDate: Joi.date().empty('').optional(),
    endDate: Joi.date().empty('').optional(),
    reason: Joi.string().min(10).max(500).trim().empty('').optional(),
    isHalfDay: Joi.boolean(),
    halfDayType: Joi.string().valid('first-half', 'second-half').trim().empty('').optional(),
    emergencyContact: Joi.object({
      name: Joi.string().trim().empty('').optional(),
      phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).trim().empty('').optional(),
      relationship: Joi.string().trim().empty('').optional()
    })
  }),
  
  review: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    reviewNotes: Joi.string().max(500).trim().empty('').optional()
  })
};

// Payroll validation schemas
export const payrollSchemas = {
  create: Joi.object({
    payPeriodStart: Joi.date().required(),
    payPeriodEnd: Joi.date().greater(Joi.ref('payPeriodStart')).required(),
    basicSalary: Joi.number().min(0).required(),
    allowances: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        type: Joi.string().valid('fixed', 'variable').default('fixed')
      })
    ).default([]),
    deductions: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        type: Joi.string().valid('tax', 'insurance', 'loan', 'other').default('other')
      })
    ).default([]),
    bonuses: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        type: Joi.string().default('performance')
      })
    ).default([]),
    overtimeHours: Joi.number().min(0).default(0),
    notes: Joi.string().max(500).trim().empty('').optional()
  }),
  
  update: Joi.object({
    basicSalary: Joi.number().min(0),
    allowances: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        type: Joi.string().valid('fixed', 'variable').default('fixed')
      })
    ),
    deductions: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        type: Joi.string().valid('tax', 'insurance', 'loan', 'other').default('other')
      })
    ),
    bonuses: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        type: Joi.string().default('performance')
      })
    ),
    overtimeHours: Joi.number().min(0),
    notes: Joi.string().max(500).trim().empty('').optional()
  })
};

// Announcement validation schemas
export const announcementSchemas = {
  create: Joi.object({
    title: Joi.string().min(5).max(200).required(),
    content: Joi.string().min(10).required(),
    type: Joi.string().valid('general', 'policy', 'event', 'urgent', 'celebration').required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    targetAudience: Joi.string().valid('all', 'admin', 'hr', 'employee').default('all'),
    targetDepartments: Joi.array().items(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
    ).default([]),
    targetEmployees: Joi.array().items(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
    ).default([]),
    isEmailNotification: Joi.boolean().default(false),
    scheduledFor: Joi.date().default(new Date()),
    expiresAt: Joi.date().greater(Joi.ref('scheduledFor')).empty('').optional()
  }),
  
  update: Joi.object({
    title: Joi.string().min(5).max(200).trim().empty('').optional(),
    content: Joi.string().min(10).trim().empty('').optional(),
    type: Joi.string().valid('general', 'policy', 'event', 'urgent', 'celebration').trim().empty('').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').trim().empty('').optional(),
    targetAudience: Joi.string().valid('all', 'admin', 'hr', 'employee').trim().empty('').optional(),
    targetDepartments: Joi.array().items(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
    ),
    targetEmployees: Joi.array().items(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
    ),
    isEmailNotification: Joi.boolean(),
    scheduledFor: Joi.date().empty('').optional(),
    expiresAt: Joi.date().empty('').optional(),
    isActive: Joi.boolean()
  })
};

// Holiday validation schemas
export const holidaySchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    date: Joi.date().required(),
    type: Joi.string().valid('national', 'religious', 'regional', 'company').required(),
    description: Joi.string().max(500).trim().empty('').optional(),
    isRecurring: Joi.boolean().default(false),
    applicableRegions: Joi.array().items(Joi.string()).default(['all']),
    applicableDepartments: Joi.array().items(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
    ).default([])
  }),
  
  update: Joi.object({
    name: Joi.string().min(2).max(100).trim().empty('').optional(),
    date: Joi.date().empty('').optional(),
    type: Joi.string().valid('national', 'religious', 'regional', 'company').trim().empty('').optional(),
    description: Joi.string().max(500).trim().empty('').optional(),
    isRecurring: Joi.boolean(),
    applicableRegions: Joi.array().items(Joi.string()),
    applicableDepartments: Joi.array().items(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
    )
  })
};

// Validation middleware functions
export const validateRegister = validate(userSchemas.register);
export const validateLogin = validate(userSchemas.login);
export const validateUpdateProfile = validate(userSchemas.updateProfile);
export const validateChangePassword = validate(userSchemas.changePassword);

export const validateEmployee = validate(employeeSchemas.create);
export const validateEmployeeUpdate = validate(employeeSchemas.update);

export const validateDepartment = validate(departmentSchemas.create);
export const validateDepartmentUpdate = validate(departmentSchemas.update);

export const validateAttendanceCheckIn = validate(attendanceSchemas.checkIn);
export const validateAttendanceCheckOut = validate(attendanceSchemas.checkOut);
export const validateManualAttendance = validate(attendanceSchemas.manual);
export const validateAttendanceUpdate = validate(attendanceSchemas.update);

export const validateLeaveApplication = validate(leaveSchemas.apply);
export const validateLeaveUpdate = validate(leaveSchemas.update);
export const validateLeaveReview = validate(leaveSchemas.review);

export const validatePayroll = validate(payrollSchemas.create);
export const validatePayrollUpdate = validate(payrollSchemas.update);

export const validateAnnouncement = validate(announcementSchemas.create);
export const validateAnnouncementUpdate = validate(announcementSchemas.update);

export const validateHoliday = validate(holidaySchemas.create);
export const validateHolidayUpdate = validate(holidaySchemas.update);