import dotenv from 'dotenv';
import User from '../models/User.js';
import { connectDB } from '../config/database.js';
import bcryptjs from 'bcryptjs';

// Load environment variables
dotenv.config();

export const createAdminUser = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Check if admin user already exists
    const adminExists = await User.findOne({ email: 'admin@gmail.com' });
    
    if (adminExists) {
      console.log('Admin user already exists');
      return;
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash('admin123', 10);

    // Create admin user
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@gmail.com',
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      phone: '+1234567890',
      address: '123 Admin St, Admin City, Admin State 12345'
    });
    
    console.log('Admin user created successfully:');
    console.log('Email: admin@gmail.com');
    console.log('Password: admin123');
    console.log('User ID:', adminUser._id);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};
