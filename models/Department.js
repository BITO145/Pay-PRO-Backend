import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Department name is required'], 
    unique: true,
    trim: true,
    maxlength: [50, 'Department name cannot exceed 50 characters']
  },
  description: { 
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  headOfDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null
  },
  budget: {
    type: Number,
    min: [0, 'Budget cannot be negative'],
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for employee count
departmentSchema.virtual('employeeCount', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'department',
  count: true
});

// Index for faster queries
departmentSchema.index({ name: 1 });
departmentSchema.index({ status: 1 });

export default mongoose.model("Department", departmentSchema);