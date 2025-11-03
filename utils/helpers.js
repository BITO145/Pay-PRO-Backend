import moment from 'moment';

// Date utility functions
export const dateUtils = {
  // Get start and end of month
  getMonthRange: (year, month) => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return { startDate, endDate };
  },

  // Get working days in a month (excluding weekends)
  getWorkingDaysInMonth: (year, month) => {
    const { startDate, endDate } = dateUtils.getMonthRange(year, month);
    let workingDays = 0;
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        workingDays++;
      }
    }
    
    return workingDays;
  },

  // Check if date is weekend
  isWeekend: (date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  },

  // Get age from date of birth
  getAge: (dateOfBirth) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  },

  // Calculate difference between two dates in days
  getDaysDifference: (date1, date2) => {
    const diffTime = Math.abs(date2 - date1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  // Format date for display
  formatDate: (date, format = 'YYYY-MM-DD') => {
    return moment(date).format(format);
  },

  // Get upcoming birthdays in next N days
  getUpcomingBirthdays: (employees, days = 7) => {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);
    
    return employees.filter(employee => {
      if (!employee.personalDetails?.dateOfBirth) return false;
      
      const birthDate = new Date(employee.personalDetails.dateOfBirth);
      const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
      
      // If birthday already passed this year, check next year
      if (thisYearBirthday < today) {
        thisYearBirthday.setFullYear(today.getFullYear() + 1);
      }
      
      return thisYearBirthday >= today && thisYearBirthday <= endDate;
    });
  },

  // Get financial year based on date
  getFinancialYear: (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    
    if (month >= 3) { // April onwards
      return { start: year, end: year + 1 };
    } else { // January to March
      return { start: year - 1, end: year };
    }
  }
};

// Generate utility functions
export const generateUtils = {
  // Generate random password
  generatePassword: (length = 8) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  },

  // Generate employee code
  generateEmployeeCode: async () => {
    const Employee = (await import('../models/Employee.js')).default;
    const count = await Employee.countDocuments();
    return `EMP${String(count + 1).padStart(4, '0')}`;
  },

  // Generate unique OTP
  generateOTP: (length = 6) => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
  },

  // Generate reference number
  generateReferenceNumber: (prefix = 'REF') => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 5).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }
};

// Validation utility functions
export const validationUtils = {
  // Validate email format
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate phone number
  isValidPhone: (phone) => {
    const phoneRegex = /^\+?[\d\s-()]+$/;
    return phoneRegex.test(phone);
  },

  // Validate PAN number (Indian)
  isValidPAN: (pan) => {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
  },

  // Validate Aadhaar number (Indian)
  isValidAadhaar: (aadhaar) => {
    const aadhaarRegex = /^\d{12}$/;
    return aadhaarRegex.test(aadhaar);
  },

  // Check password strength
  checkPasswordStrength: (password) => {
    let score = 0;
    const checks = {
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      numbers: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    score = Object.values(checks).filter(Boolean).length;
    
    let strength = 'Very Weak';
    if (score >= 5) strength = 'Very Strong';
    else if (score >= 4) strength = 'Strong';
    else if (score >= 3) strength = 'Medium';
    else if (score >= 2) strength = 'Weak';
    
    return { score, strength, checks };
  }
};

// Calculation utility functions
export const calculationUtils = {
  // Calculate leave balance
  calculateLeaveBalance: (allocated, used) => {
    return Math.max(0, allocated - used);
  },

  // Calculate working hours between two dates/times
  calculateWorkingHours: (checkIn, checkOut, breakMinutes = 60) => {
    if (!checkIn || !checkOut) return 0;
    
    const diffMs = checkOut - checkIn;
    const diffHours = diffMs / (1000 * 60 * 60);
    const breakHours = breakMinutes / 60;
    
    return Math.max(0, diffHours - breakHours);
  },

  // Calculate overtime hours (assuming 8 hours standard)
  calculateOvertimeHours: (workingHours, standardHours = 8) => {
    return Math.max(0, workingHours - standardHours);
  },

  // Calculate pro-rated salary
  calculateProRatedSalary: (fullSalary, workedDays, totalDays) => {
    return (fullSalary * workedDays) / totalDays;
  },

  // Calculate PF (Provident Fund)
  calculatePF: (basicSalary, pfRate = 0.12) => {
    return basicSalary * pfRate;
  },

  // Calculate professional tax (simplified)
  calculateProfessionalTax: (grossSalary) => {
    if (grossSalary <= 15000) return 0;
    if (grossSalary <= 25000) return 150;
    return 200;
  },

  // Calculate net salary
  calculateNetSalary: (earnings, deductions) => {
    const totalEarnings = Object.values(earnings).reduce((sum, val) => sum + (val || 0), 0);
    const totalDeductions = Object.values(deductions).reduce((sum, val) => sum + (val || 0), 0);
    return Math.max(0, totalEarnings - totalDeductions);
  }
};

// Format utility functions
export const formatUtils = {
  // Format currency (Indian Rupees)
  formatCurrency: (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency
    }).format(amount);
  },

  // Format number with commas
  formatNumber: (number) => {
    return new Intl.NumberFormat('en-IN').format(number);
  },

  // Format phone number
  formatPhone: (phone) => {
    // Simple formatting for Indian phone numbers
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
    }
    return phone;
  },

  // Capitalize first letter of each word
  capitalizeWords: (str) => {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  },

  // Generate initials from name
  getInitials: (name) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
};

// Search and filter utilities
export const searchUtils = {
  // Create search query for MongoDB
  createSearchQuery: (searchTerm, fields) => {
    if (!searchTerm) return {};
    
    const regex = new RegExp(searchTerm, 'i');
    return {
      $or: fields.map(field => ({ [field]: regex }))
    };
  },

  // Create date range filter
  createDateRangeFilter: (startDate, endDate, field = 'createdAt') => {
    const filter = {};
    if (startDate) filter[field] = { $gte: new Date(startDate) };
    if (endDate) {
      if (filter[field]) {
        filter[field].$lte = new Date(endDate);
      } else {
        filter[field] = { $lte: new Date(endDate) };
      }
    }
    return filter;
  },

  // Pagination helper
  getPaginationOptions: (page = 1, limit = 10) => {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    return {
      skip,
      limit: parseInt(limit)
    };
  }
};

// File utility functions
export const fileUtils = {
  // Get file extension
  getFileExtension: (filename) => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  },

  // Validate file type
  isValidFileType: (filename, allowedTypes) => {
    const extension = fileUtils.getFileExtension(filename).toLowerCase();
    return allowedTypes.includes(extension);
  },

  // Convert bytes to human readable format
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};

export default {
  dateUtils,
  generateUtils,
  validationUtils,
  calculationUtils,
  formatUtils,
  searchUtils,
  fileUtils
};

// Direct exports for backwards compatibility
export const generateReference = generateUtils.generateReferenceNumber;