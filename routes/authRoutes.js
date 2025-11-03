import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyToken,
  refreshToken,
  getPermissions
} from '../controllers/authController.js';
import { protect, rateLimitSensitive, auditLog } from '../middleware/auth.js';
import { validate, userSchemas } from '../middleware/validation.js';

const router = express.Router();

// Public routes
router.post('/register', 
  validate(userSchemas.register),
  register
);

router.post('/login', 
  validate(userSchemas.login),
  rateLimitSensitive,
  login
);

router.post('/forgot-password', 
  rateLimitSensitive,
  forgotPassword
);

router.put('/reset-password/:resettoken', 
  validate(userSchemas.changePassword),
  resetPassword
);

// Protected routes
router.use(protect); // All routes after this require authentication

router.post('/logout', 
  logout
);

router.get('/me', 
  getMe
);

router.put('/profile', 
  validate(userSchemas.updateProfile),
  updateProfile
);

router.put('/change-password', 
  validate(userSchemas.changePassword),
  rateLimitSensitive,
  changePassword
);

router.get('/verify-token', 
  verifyToken
);

router.post('/refresh-token', 
  refreshToken
);

router.get('/permissions', 
  getPermissions
);

export default router;