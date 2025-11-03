import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: [true, 'User reference is required'],
    unique: true
  },
  employeeCode: { 
    type: String, 
    unique: true,
    required: [true, 'Employee code is required'],
    trim: true,
    uppercase: true
  },
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Department",
    required: [true, 'Department is required']
  },
  designation: { 
    type: String,
    required: [true, 'Designation is required'],
    trim: true,
    maxlength: [50, 'Designation cannot exceed 50 characters']
  },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null
  },
  dateOfJoining: { 
    type: Date, 
    required: [true, 'Date of joining is required']
  },
  dateOfLeaving: {
    type: Date,
    default: null
  },
  employmentType: {
    type: String,
    enum: {
      values: ["full-time", "part-time", "contract", "intern"],
      message: 'Employment type must be full-time, part-time, contract, or intern'
    },
    default: "full-time"
  },
  workLocation: {
    type: String,
    enum: {
      values: ["office", "remote", "hybrid"],
      message: 'Work location must be office, remote, or hybrid'
    },
    default: "office"
  },
  salary: {
    basic: { 
      type: Number, 
      required: [true, 'Basic salary is required'],
      min: [0, 'Basic salary cannot be negative']
    },
    hra: { 
      type: Number, 
      default: 0,
      min: [0, 'HRA cannot be negative']
    },
    allowance: { 
      type: Number, 
      default: 0,
      min: [0, 'Allowance cannot be negative']
    },
    deductions: { 
      type: Number, 
      default: 0,
      min: [0, 'Deductions cannot be negative']
    },
    providentFund: {
      type: Number,
      default: 0,
      min: [0, 'Provident fund cannot be negative']
    },
    professionalTax: {
      type: Number,
      default: 0,
      min: [0, 'Professional tax cannot be negative']
    },
    incomeTax: {
      type: Number,
      default: 0,
      min: [0, 'Income tax cannot be negative']
    }
  },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String,
    accountHolderName: String
  },
  personalDetails: {
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ["male", "female", "other"]
    },
    maritalStatus: {
      type: String,
      enum: ["single", "married", "divorced", "widowed"]
    },
    bloodGroup: String,
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String
    }
  },
  documents: [{
    docType: {
      type: String,
      enum: ["id_proof", "address_proof", "education_certificate", "experience_letter", "offer_letter", "other"],
      required: true
    },
    fileName: String,
    fileUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  leaveBalance: {
    casual: {
      type: Number,
      default: 12
    },
    sick: {
      type: Number,
      default: 12
    },
    earned: {
      type: Number,
      default: 15
    },
    unpaid: {
      type: Number,
      default: 0
    }
  },
  probationPeriod: {
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ["ongoing", "completed", "extended"],
      default: "ongoing"
    }
  },
  status: {
    type: String,
    enum: {
      values: ["active", "inactive", "terminated", "resigned"],
      message: 'Status must be active, inactive, terminated, or resigned'
    },
    default: "active"
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
employeeSchema.index({ employeeCode: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ user: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ dateOfJoining: 1 });

// Virtual for gross salary
employeeSchema.virtual('grossSalary').get(function() {
  return this.salary.basic + this.salary.hra + this.salary.allowance;
});

// Virtual for net salary
employeeSchema.virtual('netSalary').get(function() {
  return this.grossSalary - this.salary.deductions - this.salary.providentFund - this.salary.professionalTax - this.salary.incomeTax;
});

// Virtual for years of experience in company
employeeSchema.virtual('yearsOfService').get(function() {
  const endDate = this.dateOfLeaving || new Date();
  return Math.floor((endDate - this.dateOfJoining) / (365.25 * 24 * 60 * 60 * 1000));
});

// Pre-save middleware to generate employee code if not provided
employeeSchema.pre('save', async function(next) {
  if (!this.isNew) return next();
  
  if (!this.employeeCode) {
    const count = await mongoose.model('Employee').countDocuments();
    this.employeeCode = `EMP${String(count + 1).padStart(4, '0')}`;
  }
  
  next();
});

export default mongoose.model("Employee", employeeSchema);