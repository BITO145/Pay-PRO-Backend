import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

// Configure Cloudinary (with friendly env fallbacks and validation)
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  // Do not throw at import time, but make misconfiguration obvious in logs
  console.error('[Cloudinary] Missing configuration. Expected env vars: CLOUDINARY_CLOUD_NAME (or CLOUDINARY_NAME), CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

// Helpful guard: cloud name should not be numeric; if it looks like a numeric API key, log a hint
if (CLOUD_NAME && /^\d+$/.test(CLOUD_NAME)) {
  console.error(`[Cloudinary] CLOUDINARY_CLOUD_NAME appears numeric ('${CLOUD_NAME}'). Did you accidentally place API key in CLOUDINARY_CLOUD_NAME?`);
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
});

// Create Cloudinary storage for different file types
const createCloudinaryStorage = (folder, allowedFormats) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `hrm/${folder}`,
      allowed_formats: allowedFormats,
      transformation: [
        { width: 1000, height: 1000, crop: 'limit', quality: 'auto' }
      ]
    },
  });
};

// File filter function
const fileFilter = (allowedMimes) => {
  return (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedMimes.join(', ')}`), false);
    }
  };
};

// Profile image upload
const profileImageStorage = createCloudinaryStorage('profile-images', ['jpg', 'jpeg', 'png']);

export const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png'])
});

// Document upload (employee documents)
const documentStorage = createCloudinaryStorage('employee-documents', ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx']);

export const uploadDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter([
    'image/jpeg', 
    'image/jpg', 
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])
});

// Announcement attachments
const announcementStorage = createCloudinaryStorage('announcement-attachments', ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx']);

export const uploadAnnouncementAttachment = multer({
  storage: announcementStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
  fileFilter: fileFilter([
    'image/jpeg', 
    'image/jpg', 
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])
});

// Leave attachments (medical certificates, etc.)
const leaveStorage = createCloudinaryStorage('leave-attachments', ['jpg', 'jpeg', 'png', 'pdf']);

export const uploadLeaveAttachment = multer({
  storage: leaveStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter([
    'image/jpeg', 
    'image/jpg', 
    'image/png',
    'application/pdf'
  ])
});

// Attendance images (punch-in / punch-out)
const attendanceStorage = createCloudinaryStorage('attendance-images', ['jpg', 'jpeg', 'png']);

export const uploadAttendanceImage = multer({
  storage: attendanceStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png'])
});

// Attendance images - memory storage variant for pre-check + manual upload
export const parseAttendanceForm = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png'])
});

// Generic file upload for multiple files
export const uploadMultiple = (fieldName, maxCount = 5, folder = 'general') => {
  const storage = createCloudinaryStorage(folder, ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx']);
  
  return multer({
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
    },
    fileFilter: fileFilter([
      'image/jpeg', 
      'image/jpg', 
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ])
  }).array(fieldName, maxCount);
};

// Handle multer errors
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size allowed is 10MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 files allowed.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload.'
      });
    }
  }
  
  if (err.message.includes('File type')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next(err);
};

// Delete file from cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from cloudinary:', error);
    throw error;
  }
};

// Get file URL from cloudinary public ID
export const getCloudinaryUrl = (publicId, transformation = {}) => {
  return cloudinary.url(publicId, transformation);
};

export default {
  uploadProfileImage,
  uploadDocument,
  uploadAnnouncementAttachment,
  uploadLeaveAttachment,
  uploadAttendanceImage,
  parseAttendanceForm,
  uploadMultiple,
  handleMulterError,
  deleteFromCloudinary,
  getCloudinaryUrl
};