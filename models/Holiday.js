import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Holiday name is required'],
    trim: true,
    maxlength: [100, 'Holiday name cannot exceed 100 characters']
  },
  date: { 
    type: Date, 
    required: [true, 'Holiday date is required']
  },
  description: { 
    type: String,
    maxlength: [300, 'Description cannot exceed 300 characters']
  },
  type: {
    type: String,
    enum: {
      values: ["National", "Regional", "Religious", "Company", "Optional"],
      message: 'Holiday type must be National, Regional, Religious, Company, or Optional'
    },
    default: "National"
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: String,
    enum: ["yearly", "monthly", "weekly"],
    default: null
  },
  applicableTo: {
    type: String,
    enum: {
      values: ["All", "Department", "Location", "Specific"],
      message: 'Applicable to must be All, Department, Location, or Specific'
    },
    default: "All"
  },
  targetDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department"
  }],
  targetEmployees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  }],
  location: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, 'Created by is required']
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  compensatoryOff: {
    type: Boolean,
    default: false
  },
  halfDay: {
    type: Boolean,
    default: false
  },
  session: {
    type: String,
    enum: ["morning", "afternoon", "full"],
    default: "full"
  },
  color: {
    type: String,
    default: "#ff5722" // Material design color
  },
  year: {
    type: Number,
    required: true,
    min: 2000
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
holidaySchema.index({ date: 1 });
holidaySchema.index({ year: 1 });
holidaySchema.index({ type: 1 });
holidaySchema.index({ isActive: 1 });
holidaySchema.index({ applicableTo: 1 });
holidaySchema.index({ year: 1, date: 1 });

// Compound index to prevent duplicate holidays on same date with same name
holidaySchema.index({ name: 1, date: 1 }, { unique: true });

// Virtual for checking if holiday is upcoming
holidaySchema.virtual('isUpcoming').get(function() {
  return this.date > new Date();
});

// Virtual for checking if holiday is today
holidaySchema.virtual('isToday').get(function() {
  const today = new Date();
  return this.date.toDateString() === today.toDateString();
});

// Virtual for days until holiday
holidaySchema.virtual('daysUntil').get(function() {
  const today = new Date();
  const diffTime = this.date - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for formatted date
holidaySchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Pre-save middleware to set year from date
holidaySchema.pre('save', function(next) {
  if (this.date) {
    this.year = this.date.getFullYear();
  }
  next();
});

// Static method to get holidays for a specific user
holidaySchema.statics.getHolidaysForUser = async function(userId, year = null) {
  const User = mongoose.model('User');
  const Employee = mongoose.model('Employee');
  
  const user = await User.findById(userId);
  if (!user) return [];
  
  let employee = null;
  if (user.role === 'employee') {
    employee = await Employee.findOne({ user: userId }).populate('department');
  }
  
  // Build query
  const query = {
    isActive: true,
    $or: [
      { applicableTo: 'All' }
    ]
  };
  
  if (year) {
    query.year = year;
  }
  
  // Add department-specific holidays
  if (employee && employee.department) {
    query.$or.push(
      { applicableTo: 'Department', targetDepartments: employee.department._id },
      { applicableTo: 'Specific', targetEmployees: employee._id }
    );
  }
  
  return await this.find(query)
    .populate('createdBy', 'name')
    .populate('targetDepartments', 'name')
    .sort({ date: 1 });
};

// Static method to get upcoming holidays
holidaySchema.statics.getUpcomingHolidays = async function(userId, limit = 5) {
  const holidays = await this.getHolidaysForUser(userId);
  const today = new Date();
  
  return holidays
    .filter(holiday => holiday.date >= today)
    .slice(0, limit);
};

// Static method to check if a date is a holiday
holidaySchema.statics.isHoliday = async function(date, userId = null) {
  const query = {
    date: {
      $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    },
    isActive: true
  };
  
  if (userId) {
    // If user ID provided, check user-specific holidays
    const User = mongoose.model('User');
    const Employee = mongoose.model('Employee');
    
    const user = await User.findById(userId);
    if (user && user.role === 'employee') {
      const employee = await Employee.findOne({ user: userId }).populate('department');
      
      query.$or = [
        { applicableTo: 'All' }
      ];
      
      if (employee && employee.department) {
        query.$or.push(
          { applicableTo: 'Department', targetDepartments: employee.department._id },
          { applicableTo: 'Specific', targetEmployees: employee._id }
        );
      }
    } else {
      query.applicableTo = 'All';
    }
  } else {
    query.applicableTo = 'All';
  }
  
  const holiday = await this.findOne(query);
  return holiday;
};

// Static method to get holidays by month
holidaySchema.statics.getHolidaysByMonth = async function(year, month, userId = null) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  const query = {
    date: {
      $gte: startDate,
      $lte: endDate
    },
    isActive: true
  };
  
  if (userId) {
    return await this.getHolidaysForUser(userId).then(holidays => 
      holidays.filter(holiday => 
        holiday.date >= startDate && holiday.date <= endDate
      )
    );
  }
  
  query.applicableTo = 'All';
  return await this.find(query).sort({ date: 1 });
};

export default mongoose.model("Holiday", holidaySchema);