import mongoose from 'mongoose';
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'hrm-database' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Database connection function
export const connectDB = async () => {
  try {
    // MongoDB connection options
    const options = {
      // Connection options
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close connections after 45 seconds of inactivity
      
      // Additional options for production
      ...(process.env.NODE_ENV === 'production' && {
        ssl: true,
        sslValidate: true,
      })
    };

    // Connect to MongoDB
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        logger.error('Error during MongoDB disconnection:', err);
        process.exit(1);
      }
    });
    
    return conn;
    
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Database health check
export const checkDBHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      status: states[state],
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return { status: 'error', error: error.message };
  }
};

// Create database indexes
export const createIndexes = async () => {
  try {
    logger.info('Creating database indexes...');
    
    // Import models to ensure indexes are created
    const { 
      User, 
      Employee, 
      Department, 
      Attendance, 
      Leave, 
      Payroll, 
      Announcement, 
      Holiday, 
      AuditLog 
    } = await import('../models/index.js');
    
    // Create compound indexes for better performance
    await Employee.collection.createIndex({ user: 1, status: 1 });
    await Attendance.collection.createIndex({ employee: 1, date: -1 });
    await Leave.collection.createIndex({ employee: 1, status: 1, fromDate: -1 });
    await Payroll.collection.createIndex({ 
      employee: 1, 
      'payrollPeriod.year': -1, 
      'payrollPeriod.month': -1 
    });
    await AuditLog.collection.createIndex({ user: 1, createdAt: -1 });
    await Announcement.collection.createIndex({ 
      isPublished: 1, 
      publishDate: -1, 
      expiresAt: 1 
    });
    
    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Error creating indexes:', error);
    throw error;
  }
};

// Seed initial data
export const seedInitialData = async () => {
  try {
    const { User, Department } = await import('../models/index.js');
    
    // Check if admin user already exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      logger.info('Admin user already exists, skipping seed data');
      return;
    }
    
    logger.info('Seeding initial data...');
    
    // Create default admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@company.com',
      password: 'admin123', // This will be hashed by the pre-save middleware
      role: 'admin',
      phone: '+1234567890',
      address: 'Company Address'
    });
    
    await adminUser.save();
    logger.info('Admin user created successfully');
    
    // Create default departments
    const defaultDepartments = [
      {
        name: 'Human Resources',
        description: 'Manages employee relations, recruitment, and policies'
      },
      {
        name: 'Information Technology',
        description: 'Handles technology infrastructure and software development'
      },
      {
        name: 'Finance & Accounting',
        description: 'Manages financial operations and accounting'
      },
      {
        name: 'Marketing & Sales',
        description: 'Handles marketing campaigns and sales operations'
      },
      {
        name: 'Operations',
        description: 'Manages day-to-day business operations'
      }
    ];
    
    await Department.insertMany(defaultDepartments);
    logger.info('Default departments created successfully');
    
    logger.info('Initial data seeding completed');
    
  } catch (error) {
    logger.error('Error seeding initial data:', error);
    throw error;
  }
};

// Database backup helper (for development)
export const createBackup = async (backupPath) => {
  try {
    logger.info(`Creating database backup at ${backupPath}`);
    
    // This is a simplified backup - in production, use mongodump
    const collections = mongoose.connection.db.listCollections();
    const backup = {};
    
    await collections.forEach(async (collection) => {
      const collectionName = collection.name;
      backup[collectionName] = await mongoose.connection.db
        .collection(collectionName)
        .find({})
        .toArray();
    });
    
    // In a real scenario, you would write this to a file
    logger.info('Database backup created successfully');
    return backup;
    
  } catch (error) {
    logger.error('Error creating database backup:', error);
    throw error;
  }
};

// Database statistics
export const getDBStats = async () => {
  try {
    const stats = await mongoose.connection.db.stats();
    
    // Get collection counts
    const { 
      User, 
      Employee, 
      Department, 
      Attendance, 
      Leave, 
      Payroll, 
      Announcement, 
      Holiday, 
      AuditLog 
    } = await import('../models/index.js');
    
    const counts = {
      users: await User.countDocuments(),
      employees: await Employee.countDocuments(),
      departments: await Department.countDocuments(),
      attendanceRecords: await Attendance.countDocuments(),
      leaves: await Leave.countDocuments(),
      payrollRecords: await Payroll.countDocuments(),
      announcements: await Announcement.countDocuments(),
      holidays: await Holiday.countDocuments(),
      auditLogs: await AuditLog.countDocuments()
    };
    
    return {
      database: stats,
      collections: counts,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('Error getting database statistics:', error);
    throw error;
  }
};

export default {
  connectDB,
  checkDBHealth,
  createIndexes,
  seedInitialData,
  createBackup,
  getDBStats,
  logger
};