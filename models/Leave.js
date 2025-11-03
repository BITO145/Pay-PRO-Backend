import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema({
  employee: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Employee", 
    required: [true, 'Employee reference is required']
  },
  type: { 
    type: String, 
    enum: {
      values: ["Casual", "Sick", "Earned", "Unpaid", "Maternity", "Paternity", "Bereavement", "Emergency"],
      message: 'Leave type must be Casual, Sick, Earned, Unpaid, Maternity, Paternity, Bereavement, or Emergency'
    }, 
    required: [true, 'Leave type is required']
  },
  fromDate: { 
    type: Date, 
    required: [true, 'From date is required']
  },
  toDate: { 
    type: Date, 
    required: [true, 'To date is required'],
    validate: {
      validator: function(v) {
        return v >= this.fromDate;
      },
      message: 'To date should be greater than or equal to from date'
    }
  },
  totalDays: {
    type: Number,
    min: [0.5, 'Leave days should be at least 0.5'],
    required: true
  },
  reason: { 
    type: String,
    required: [true, 'Reason is required'],
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  status: { 
    type: String, 
    enum: {
      values: ["Pending", "Approved", "Rejected", "Cancelled"],
      message: 'Status must be Pending, Approved, Rejected, or Cancelled'
    }, 
    default: "Pending" 
  },
  appliedDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User"
  },
  approvedDate: {
    type: Date
  },
  rejectionReason: {
    type: String,
    maxlength: [200, 'Rejection reason cannot exceed 200 characters']
  },
  comments: { 
    type: String,
    maxlength: [300, 'Comments cannot exceed 300 characters']
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isHalfDay: {
    type: Boolean,
    default: false
  },
  halfDaySession: {
    type: String,
    enum: ["morning", "afternoon"],
    default: null
  },
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  handoverTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },
  handoverNotes: {
    type: String,
    maxlength: [500, 'Handover notes cannot exceed 500 characters']
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
leaveSchema.index({ employee: 1 });
leaveSchema.index({ status: 1 });
leaveSchema.index({ type: 1 });
leaveSchema.index({ fromDate: 1, toDate: 1 });
leaveSchema.index({ employee: 1, status: 1 });

// Virtual for leave duration in a readable format
leaveSchema.virtual('duration').get(function() {
  if (this.totalDays === 1) {
    return this.isHalfDay ? '0.5 day' : '1 day';
  }
  return `${this.totalDays} days`;
});

// Pre-save middleware to calculate total days
leaveSchema.pre('save', function(next) {
  if (this.fromDate && this.toDate) {
    const timeDiff = this.toDate.getTime() - this.fromDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
    
    if (this.isHalfDay && daysDiff === 1) {
      this.totalDays = 0.5;
    } else {
      this.totalDays = daysDiff;
    }
  }
  
  // Set approved date when status changes to approved
  if (this.isModified('status') && this.status === 'Approved' && !this.approvedDate) {
    this.approvedDate = new Date();
  }
  
  next();
});

// Static method to get leave balance for an employee
leaveSchema.statics.getLeaveBalance = async function(employeeId) {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const endOfYear = new Date(currentYear, 11, 31);
  
  const pipeline = [
    {
      $match: {
        employee: new mongoose.Types.ObjectId(employeeId),
        status: 'Approved',
        fromDate: {
          $gte: startOfYear,
          $lte: endOfYear
        }
      }
    },
    {
      $group: {
        _id: '$type',
        totalUsed: { $sum: '$totalDays' }
      }
    }
  ];
  
  const usedLeaves = await this.aggregate(pipeline);
  
  // Get employee's leave balance from Employee model
  const Employee = mongoose.model('Employee');
  const employee = await Employee.findById(employeeId).select('leaveBalance');
  
  const leaveBalance = {};
  if (employee && employee.leaveBalance) {
    for (const [leaveType, allocated] of Object.entries(employee.leaveBalance)) {
      const used = usedLeaves.find(leave => leave._id.toLowerCase() === leaveType.toLowerCase())?.totalUsed || 0;
      leaveBalance[leaveType] = {
        allocated,
        used,
        remaining: allocated - used
      };
    }
  }
  
  return leaveBalance;
};

// Static method to check leave conflicts
leaveSchema.statics.checkLeaveConflict = async function(employeeId, fromDate, toDate, excludeLeaveId = null) {
  const query = {
    employee: employeeId,
    status: { $in: ['Pending', 'Approved'] },
    $or: [
      {
        fromDate: { $lte: toDate },
        toDate: { $gte: fromDate }
      }
    ]
  };
  
  if (excludeLeaveId) {
    query._id = { $ne: excludeLeaveId };
  }
  
  return await this.find(query);
};

export default mongoose.model("Leave", leaveSchema);