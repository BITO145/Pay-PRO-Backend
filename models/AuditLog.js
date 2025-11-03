import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: [true, 'User is required']
  },
  action: { 
    type: String,
    required: [true, 'Action is required'],
    maxlength: [100, 'Action cannot exceed 100 characters']
  },
  targetModel: { 
    type: String,
    required: [true, 'Target model is required'],
    enum: {
      values: ["User", "Employee", "Department", "Attendance", "Leave", "Payroll", "Announcement", "Holiday"],
      message: 'Target model must be one of the defined models'
    }
  },
  targetId: { 
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Target ID is required']
  },
  targetName: {
    type: String,
    maxlength: [100, 'Target name cannot exceed 100 characters']
  },
  method: {
    type: String,
    enum: {
      values: ["CREATE", "READ", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT"],
      message: 'Method must be CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT, or EXPORT'
    },
    required: [true, 'Method is required']
  },
  endpoint: {
    type: String,
    maxlength: [200, 'Endpoint cannot exceed 200 characters']
  },
  ipAddress: {
    type: String,
    match: [/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$|^::1$|^::$/, 'Invalid IP address']
  },
  userAgent: {
    type: String,
    maxlength: [500, 'User agent cannot exceed 500 characters']
  },
  details: { 
    type: Object,
    default: {}
  },
  changes: {
    before: { type: Object, default: null },
    after: { type: Object, default: null },
    changedFields: [String]
  },
  result: {
    type: String,
    enum: {
      values: ["SUCCESS", "FAILURE", "PARTIAL"],
      message: 'Result must be SUCCESS, FAILURE, or PARTIAL'
    },
    default: "SUCCESS"
  },
  errorMessage: {
    type: String,
    maxlength: [500, 'Error message cannot exceed 500 characters']
  },
  duration: {
    type: Number, // Duration in milliseconds
    min: [0, 'Duration cannot be negative']
  },
  severity: {
    type: String,
    enum: {
      values: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      message: 'Severity must be LOW, MEDIUM, HIGH, or CRITICAL'
    },
    default: "LOW"
  },
  category: {
    type: String,
    enum: {
      values: ["AUTHENTICATION", "AUTHORIZATION", "DATA_ACCESS", "DATA_MODIFICATION", "SYSTEM", "SECURITY"],
      message: 'Category must be AUTHENTICATION, AUTHORIZATION, DATA_ACCESS, DATA_MODIFICATION, SYSTEM, or SECURITY'
    },
    default: "DATA_ACCESS"
  },
  sessionId: {
    type: String,
    maxlength: [100, 'Session ID cannot exceed 100 characters']
  },
  location: {
    country: String,
    city: String,
    region: String
  },
  deviceInfo: {
    type: String,
    maxlength: [200, 'Device info cannot exceed 200 characters']
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries and performance
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ targetModel: 1, targetId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ method: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ result: 1 });

// TTL index to automatically delete old logs (optional - keep logs for 2 years)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

// Virtual for formatted timestamp
auditLogSchema.virtual('formattedTimestamp').get(function() {
  return this.createdAt.toLocaleString();
});

// Virtual for risk level based on severity and category
auditLogSchema.virtual('riskLevel').get(function() {
  if (this.severity === 'CRITICAL' || (this.severity === 'HIGH' && this.category === 'SECURITY')) {
    return 'HIGH_RISK';
  } else if (this.severity === 'HIGH' || (this.severity === 'MEDIUM' && ['SECURITY', 'AUTHENTICATION'].includes(this.category))) {
    return 'MEDIUM_RISK';
  } else {
    return 'LOW_RISK';
  }
});

// Static method to log an action
auditLogSchema.statics.logAction = async function(logData) {
  try {
    // Set default values
    const auditLog = new this({
      user: logData.user,
      action: logData.action,
      targetModel: logData.targetModel,
      targetId: logData.targetId,
      targetName: logData.targetName,
      method: logData.method,
      endpoint: logData.endpoint,
      ipAddress: logData.ipAddress,
      userAgent: logData.userAgent,
      details: logData.details || {},
      changes: logData.changes || {},
      result: logData.result || 'SUCCESS',
      errorMessage: logData.errorMessage,
      duration: logData.duration,
      severity: logData.severity || 'LOW',
      category: logData.category || 'DATA_ACCESS',
      sessionId: logData.sessionId,
      location: logData.location,
      deviceInfo: logData.deviceInfo
    });
    
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error to avoid breaking the main operation
    return null;
  }
};

// Static method to get activity summary for a user
auditLogSchema.statics.getUserActivitySummary = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const pipeline = [
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          action: '$method'
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': -1 }
    }
  ];
  
  return await this.aggregate(pipeline);
};

// Static method to get security events
auditLogSchema.statics.getSecurityEvents = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.find({
    createdAt: { $gte: startDate },
    $or: [
      { category: 'SECURITY' },
      { severity: { $in: ['HIGH', 'CRITICAL'] } },
      { result: 'FAILURE' }
    ]
  })
  .populate('user', 'name email role')
  .sort({ createdAt: -1 })
  .limit(100);
};

// Static method to get system usage statistics
auditLogSchema.statics.getUsageStatistics = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalActions: { $sum: 1 },
        uniqueUsers: { $addToSet: '$user' },
        actionsByMethod: {
          $push: '$method'
        },
        actionsByCategory: {
          $push: '$category'
        },
        failedActions: {
          $sum: {
            $cond: [{ $eq: ['$result', 'FAILURE'] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        totalActions: 1,
        uniqueUsersCount: { $size: '$uniqueUsers' },
        failedActions: 1,
        successRate: {
          $multiply: [
            { $divide: [
              { $subtract: ['$totalActions', '$failedActions'] },
              '$totalActions'
            ]},
            100
          ]
        }
      }
    }
  ];
  
  return await this.aggregate(pipeline);
};

export default mongoose.model("AuditLog", auditLogSchema);