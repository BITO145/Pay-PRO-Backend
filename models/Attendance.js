import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  employee: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Employee", 
    required: [true, 'Employee reference is required']
  },
  date: { 
    type: Date, 
    required: [true, 'Date is required']
  },
  checkIn: { 
    type: Date,
    validate: {
      validator: function(v) {
        // Check-in should be within the same day as the date
        if (!v || !this.date) return true;
        return v.toDateString() === this.date.toDateString();
      },
      message: 'Check-in time should be on the same date'
    }
  },
  checkOut: { 
    type: Date,
  // Images for punch-in / punch-out (Cloudinary URLs)
  punchInImageUrl: {
    type: String
  },
  punchOutImageUrl: {
    type: String
  },
  // Session status for the day (separate from final attendance status)
  sessionStatus: {
    type: String,
    enum: {
      values: ['idle', 'active', 'completed', 'auto-stopped'],
      message: 'Session status must be idle, active, completed, or auto-stopped'
    },
    default: 'idle'
  },
    validate: {
      validator: function(v) {
        // Check-out should be after check-in and within reasonable time
        if (!v || !this.checkIn) return true;
        return v > this.checkIn;
      },
      message: 'Check-out time should be after check-in time'
    }
  },
  status: { 
    type: String, 
    enum: {
      values: ["Present", "Absent", "Half Day", "Leave", "Holiday", "Weekend"],
      message: 'Status must be Present, Absent, Half Day, Leave, Holiday, or Weekend'
    }, 
    default: "Present" 
  },
  workingHours: {
    type: Number,
    min: [0, 'Working hours cannot be negative'],
    max: [24, 'Working hours cannot exceed 24 hours'],
    default: 0
  },
  overtimeHours: {
    type: Number,
    min: [0, 'Overtime hours cannot be negative'],
    default: 0
  },
  breakDuration: {
    type: Number, // in minutes
    min: [0, 'Break duration cannot be negative'],
    default: 60 // Default 1 hour break
  },
  location: {
    checkInLocation: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    checkOutLocation: {
      latitude: Number,
      longitude: Number,
      address: String
    }
  },
  ipAddress: {
    checkInIP: String,
    checkOutIP: String
  },
  remarks: { 
    type: String,
    maxlength: [200, 'Remarks cannot exceed 200 characters']
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  isLateEntry: {
    type: Boolean,
    default: false
  },
  isEarlyExit: {
    type: Boolean,
    default: false
  },
  leaveReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Leave"
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to prevent duplicate records per day per employee
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Other indexes for faster queries
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ employee: 1, status: 1 });

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return this.date.toDateString();
});

// Method to calculate working hours
attendanceSchema.methods.calculateWorkingHours = function() {
  if (this.checkIn && this.checkOut) {
    const diffInMs = this.checkOut - this.checkIn;
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const breakHours = (this.breakDuration || 0) / 60;
    this.workingHours = Math.max(0, diffInHours - breakHours);
    
    // Calculate overtime (assuming 8 hours is standard work day)
    const standardHours = 8;
    this.overtimeHours = Math.max(0, this.workingHours - standardHours);
  }
  return this.workingHours;
};

// Pre-save middleware to calculate working hours and check late/early flags
attendanceSchema.pre('save', function(next) {
  // Calculate working hours if check-in and check-out are present
  if (this.checkIn && this.checkOut) {
    this.calculateWorkingHours();
    
    // Check for late entry (assuming office starts at 9 AM)
    const checkInTime = new Date(this.checkIn);
    const standardStartTime = new Date(this.date);
    standardStartTime.setHours(9, 0, 0, 0); // 9:00 AM
    this.isLateEntry = checkInTime > standardStartTime;
    
    // Check for early exit (assuming office ends at 6 PM)
    const checkOutTime = new Date(this.checkOut);
    const standardEndTime = new Date(this.date);
    standardEndTime.setHours(18, 0, 0, 0); // 6:00 PM
    this.isEarlyExit = checkOutTime < standardEndTime;
  }
  
  next();
});

// Static method to get attendance summary for an employee
attendanceSchema.statics.getAttendanceSummary = async function(employeeId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        employee: new mongoose.Types.ObjectId(employeeId),
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalWorkingHours: { $sum: '$workingHours' },
        totalOvertimeHours: { $sum: '$overtimeHours' }
      }
    }
  ];
  
  return await this.aggregate(pipeline);
};

export default mongoose.model("Attendance", attendanceSchema);