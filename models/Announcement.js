import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: { 
    type: String, 
    required: [true, 'Message is required'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: [true, 'Created by is required']
  },
  audience: { 
    type: String, 
    enum: {
      values: ["All", "HR", "Employee", "Department", "Specific"],
      message: 'Audience must be All, HR, Employee, Department, or Specific'
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
  priority: {
    type: String,
    enum: {
      values: ["Low", "Medium", "High", "Urgent"],
      message: 'Priority must be Low, Medium, High, or Urgent'
    },
    default: "Medium"
  },
  category: {
    type: String,
    enum: {
      values: ["General", "Policy", "Event", "Holiday", "Training", "Reminder", "Emergency"],
      message: 'Category must be General, Policy, Event, Holiday, Training, Reminder, or Emergency'
    },
    default: "General"
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  expiresAt: { 
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > this.publishDate;
      },
      message: 'Expiry date should be after publish date'
    }
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    comment: {
      type: String,
      required: true,
      maxlength: [300, 'Comment cannot exceed 300 characters']
    },
    commentedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: {
      values: ["Draft", "Published", "Archived"],
      message: 'Status must be Draft, Published, or Archived'
    },
    default: "Published"
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
announcementSchema.index({ createdBy: 1 });
announcementSchema.index({ audience: 1 });
announcementSchema.index({ publishDate: -1 });
announcementSchema.index({ expiresAt: 1 });
announcementSchema.index({ priority: 1 });
announcementSchema.index({ category: 1 });
announcementSchema.index({ status: 1 });
announcementSchema.index({ isPinned: -1, publishDate: -1 });

// Virtual for read count
announcementSchema.virtual('readCount').get(function() {
  return this.readBy ? this.readBy.length : 0;
});

// Virtual for like count
announcementSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comment count
announcementSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Virtual for checking if announcement is active
announcementSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.isPublished && 
         this.status === 'Published' && 
         this.publishDate <= now && 
         (!this.expiresAt || this.expiresAt > now);
});

// Virtual for days until expiry
announcementSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diffTime = this.expiresAt - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Instance method to mark as read by user
announcementSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  if (!existingRead) {
    this.readBy.push({ user: userId });
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to toggle like by user
announcementSchema.methods.toggleLike = function(userId) {
  const existingLikeIndex = this.likes.findIndex(like => like.user.toString() === userId.toString());
  if (existingLikeIndex > -1) {
    this.likes.splice(existingLikeIndex, 1);
  } else {
    this.likes.push({ user: userId });
  }
  return this.save();
};

// Instance method to add comment
announcementSchema.methods.addComment = function(userId, comment) {
  this.comments.push({ user: userId, comment });
  return this.save();
};

// Static method to get announcements for a user based on their role and department
announcementSchema.statics.getAnnouncementsForUser = async function(userId) {
  const User = mongoose.model('User');
  const Employee = mongoose.model('Employee');
  
  const user = await User.findById(userId);
  if (!user) return [];
  
  let employee = null;
  if (user.role === 'employee') {
    employee = await Employee.findOne({ user: userId }).populate('department');
  }
  
  const now = new Date();
  
  // Build query based on user role and targeting
  const query = {
    isPublished: true,
    status: 'Published',
    publishDate: { $lte: now },
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: now } }
    ],
    $or: [
      { audience: 'All' },
      { audience: user.role === 'hr' ? 'HR' : 'Employee' }
    ]
  };
  
  // Add department-specific targeting
  if (employee && employee.department) {
    query.$or.push(
      { audience: 'Department', targetDepartments: employee.department._id },
      { audience: 'Specific', targetEmployees: employee._id }
    );
  }
  
  return await this.find(query)
    .populate('createdBy', 'name email')
    .populate('targetDepartments', 'name')
    .populate('targetEmployees', 'user')
    .populate('readBy.user', 'name')
    .populate('likes.user', 'name')
    .populate('comments.user', 'name')
    .sort({ isPinned: -1, publishDate: -1 });
};

// Pre-save middleware to auto-archive expired announcements
announcementSchema.pre('save', function(next) {
  if (this.expiresAt && this.expiresAt <= new Date() && this.status === 'Published') {
    this.status = 'Archived';
  }
  next();
});

export default mongoose.model("Announcement", announcementSchema);