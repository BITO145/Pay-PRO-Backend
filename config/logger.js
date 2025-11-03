import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = './logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'hrm-backend' },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Audit logs (security related)
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 10, // Keep more audit logs
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        return `${timestamp} [${service}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
      })
    )
  }));
}

// Custom logging methods for different scenarios
export const authLogger = {
  loginSuccess: (userId, ip, userAgent) => {
    logger.info('User login successful', {
      userId,
      ip,
      userAgent,
      event: 'LOGIN_SUCCESS'
    });
  },
  
  loginFailure: (email, ip, reason) => {
    logger.warn('User login failed', {
      email,
      ip,
      reason,
      event: 'LOGIN_FAILURE'
    });
  },
  
  logout: (userId, ip) => {
    logger.info('User logout', {
      userId,
      ip,
      event: 'LOGOUT'
    });
  },
  
  passwordReset: (userId, ip) => {
    logger.info('Password reset requested', {
      userId,
      ip,
      event: 'PASSWORD_RESET'
    });
  },
  
  passwordChanged: (userId, ip) => {
    logger.info('Password changed', {
      userId,
      ip,
      event: 'PASSWORD_CHANGE'
    });
  },
  
  tokenExpired: (userId, ip) => {
    logger.warn('Token expired', {
      userId,
      ip,
      event: 'TOKEN_EXPIRED'
    });
  },
  
  unauthorizedAccess: (ip, endpoint, userAgent) => {
    logger.warn('Unauthorized access attempt', {
      ip,
      endpoint,
      userAgent,
      event: 'UNAUTHORIZED_ACCESS'
    });
  }
};

export const dataLogger = {
  create: (model, documentId, userId, ip) => {
    logger.info(`${model} created`, {
      model,
      documentId,
      userId,
      ip,
      event: 'DATA_CREATE'
    });
  },
  
  update: (model, documentId, userId, ip, changes) => {
    logger.info(`${model} updated`, {
      model,
      documentId,
      userId,
      ip,
      changes,
      event: 'DATA_UPDATE'
    });
  },
  
  delete: (model, documentId, userId, ip) => {
    logger.warn(`${model} deleted`, {
      model,
      documentId,
      userId,
      ip,
      event: 'DATA_DELETE'
    });
  },
  
  export: (type, userId, ip, recordCount) => {
    logger.info(`Data exported`, {
      type,
      userId,
      ip,
      recordCount,
      event: 'DATA_EXPORT'
    });
  }
};

export const systemLogger = {
  startup: () => {
    logger.info('HRM System started', {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
      pid: process.pid,
      event: 'SYSTEM_START'
    });
  },
  
  shutdown: () => {
    logger.info('HRM System shutdown', {
      event: 'SYSTEM_SHUTDOWN'
    });
  },
  
  databaseConnection: (status, host) => {
    logger.info(`Database connection ${status}`, {
      host,
      event: 'DB_CONNECTION'
    });
  },
  
  error: (error, context = {}) => {
    logger.error('System error', {
      error: error.message,
      stack: error.stack,
      ...context,
      event: 'SYSTEM_ERROR'
    });
  },
  
  performance: (operation, duration, details = {}) => {
    if (duration > 1000) { // Log slow operations (>1s)
      logger.warn('Slow operation detected', {
        operation,
        duration: `${duration}ms`,
        ...details,
        event: 'SLOW_OPERATION'
      });
    }
  }
};

export const securityLogger = {
  suspiciousActivity: (userId, ip, activity, details) => {
    logger.warn('Suspicious activity detected', {
      userId,
      ip,
      activity,
      details,
      event: 'SUSPICIOUS_ACTIVITY'
    });
  },
  
  rateLimitExceeded: (ip, endpoint, attempts) => {
    logger.warn('Rate limit exceeded', {
      ip,
      endpoint,
      attempts,
      event: 'RATE_LIMIT_EXCEEDED'
    });
  },
  
  bruteForceAttempt: (ip, email, attempts) => {
    logger.error('Brute force attempt detected', {
      ip,
      email,
      attempts,
      event: 'BRUTE_FORCE'
    });
  },
  
  fileUploadSecurity: (userId, ip, fileName, fileType, reason) => {
    logger.warn('File upload security issue', {
      userId,
      ip,
      fileName,
      fileType,
      reason,
      event: 'FILE_SECURITY'
    });
  }
};

// Express middleware for request logging
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user._id : null,
    event: 'HTTP_REQUEST'
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    
    logger.info('HTTP Response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user ? req.user._id : null,
      event: 'HTTP_RESPONSE'
    });
    
    // Check for slow requests
    if (duration > 5000) {
      systemLogger.performance('HTTP Request', duration, {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode
      });
    }
    
    originalEnd.apply(this, args);
  };
  
  next();
};

// Export main logger
export default logger;