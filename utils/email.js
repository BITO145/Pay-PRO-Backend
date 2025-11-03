import nodemailer from 'nodemailer';

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send email function
export const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `${process.env.COMPANY_NAME || 'HRM System'} <${process.env.EMAIL_FROM}>`,
      to: options.email,
      subject: options.subject,
      html: options.html || options.message,
      text: options.text
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Email templates
export const emailTemplates = {
  // Welcome email for new employees
  welcome: (employeeName, employeeCode, tempPassword) => ({
    subject: 'Welcome to the Team! Your HRM Account Details',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Welcome to ${process.env.COMPANY_NAME || 'Our Company'}!</h2>
        <p>Dear ${employeeName},</p>
        <p>We're excited to welcome you to our team! Your HRM account has been created with the following details:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Employee Code:</strong> ${employeeCode}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        
        <p>Please log in to your account using these credentials and change your password immediately for security purposes.</p>
        
        <p>If you have any questions, please don't hesitate to reach out to the HR team.</p>
        
        <p>Best regards,<br>HR Team<br>${process.env.COMPANY_NAME || 'Company'}</p>
      </div>
    `
  }),

  // Password reset email
  passwordReset: (name, resetToken, resetUrl) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>You have requested a password reset for your HRM account.</p>
        
        <p>Click the button below to reset your password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #3498db;">${resetUrl}</p>
        
        <p><strong>This link will expire in 10 minutes.</strong></p>
        
        <p>If you didn't request this password reset, please ignore this email.</p>
        
        <p>Best regards,<br>HR Team</p>
      </div>
    `
  }),

  // Leave application notification (to HR)
  leaveApplicationHR: (employeeName, leaveType, fromDate, toDate, reason) => ({
    subject: `New Leave Application from ${employeeName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">New Leave Application</h2>
        <p>A new leave application has been submitted:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Employee:</strong> ${employeeName}</p>
          <p><strong>Leave Type:</strong> ${leaveType}</p>
          <p><strong>From:</strong> ${fromDate}</p>
          <p><strong>To:</strong> ${toDate}</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
        
        <p>Please log in to the HRM system to review and approve/reject this application.</p>
        
        <p>Best regards,<br>HRM System</p>
      </div>
    `
  }),

  // Leave status update (to employee)
  leaveStatusUpdate: (employeeName, leaveType, status, fromDate, toDate, comments) => ({
    subject: `Leave Application ${status}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${status === 'Approved' ? '#27ae60' : '#e74c3c'};">
          Leave Application ${status}
        </h2>
        <p>Dear ${employeeName},</p>
        <p>Your leave application has been <strong>${status.toLowerCase()}</strong>:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Leave Type:</strong> ${leaveType}</p>
          <p><strong>Dates:</strong> ${fromDate} to ${toDate}</p>
          ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
        </div>
        
        <p>If you have any questions, please contact the HR team.</p>
        
        <p>Best regards,<br>HR Team</p>
      </div>
    `
  }),

  // Payroll generated notification
  payrollGenerated: (employeeName, month, year, netSalary) => ({
    subject: `Payslip Generated for ${month} ${year}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Payslip Generated</h2>
        <p>Dear ${employeeName},</p>
        <p>Your payslip for ${month} ${year} has been generated.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Net Salary:</strong> ₹${netSalary}</p>
        </div>
        
        <p>Please log in to the HRM system to view and download your detailed payslip.</p>
        
        <p>Best regards,<br>HR Team</p>
      </div>
    `
  }),

  // New announcement notification
  announcement: (title, message, priority) => ({
    subject: `${priority === 'Urgent' ? '[URGENT] ' : ''}New Announcement: ${title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${priority === 'Urgent' ? '#e74c3c' : '#2c3e50'};">
          ${priority === 'Urgent' ? '🚨 URGENT: ' : ''}${title}
        </h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          ${message.replace(/\n/g, '<br>')}
        </div>
        
        <p>Please log in to the HRM system to view the full announcement.</p>
        
        <p>Best regards,<br>HR Team</p>
      </div>
    `
  }),

  // Birthday wishes
  birthday: (employeeName) => ({
    subject: '🎉 Happy Birthday!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; text-align: center;">
        <h1 style="color: #e74c3c;">🎉 Happy Birthday, ${employeeName}! 🎉</h1>
        <p style="font-size: 18px;">Wishing you a wonderful year ahead filled with happiness, success, and prosperity!</p>
        
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="font-size: 16px; color: #856404;">
            May this new year of your life bring you joy, good health, and all the success you deserve!
          </p>
        </div>
        
        <p>Warm wishes from all of us at ${process.env.COMPANY_NAME || 'the company'}!</p>
        
        <p>Best regards,<br>HR Team & Colleagues</p>
      </div>
    `
  })
};

// Utility functions for email
export const emailUtils = {
  // Send welcome email to new employee
  sendWelcomeEmail: async (employee, tempPassword) => {
    const template = emailTemplates.welcome(employee.user.name, employee.employeeCode, tempPassword);
    await sendEmail({
      email: employee.user.email,
      ...template
    });
  },

  // Send password reset email
  sendPasswordResetEmail: async (user, resetToken) => {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    const template = emailTemplates.passwordReset(user.name, resetToken, resetUrl);
    await sendEmail({
      email: user.email,
      ...template
    });
  },

  // Send leave application notification to HR
  notifyHRLeaveApplication: async (leave, employee) => {
    // Get all HR users
    const User = (await import('../models/User.js')).default;
    const hrUsers = await User.find({ role: 'hr', status: 'active' });
    
    const template = emailTemplates.leaveApplicationHR(
      employee.user.name,
      leave.type,
      leave.fromDate.toDateString(),
      leave.toDate.toDateString(),
      leave.reason
    );
    
    // Send to all HR users
    const emailPromises = hrUsers.map(hr => 
      sendEmail({
        email: hr.email,
        ...template
      })
    );
    
    await Promise.all(emailPromises);
  },

  // Send leave status update to employee
  sendLeaveStatusUpdate: async (leave, employee) => {
    const template = emailTemplates.leaveStatusUpdate(
      employee.user.name,
      leave.type,
      leave.status,
      leave.fromDate.toDateString(),
      leave.toDate.toDateString(),
      leave.comments
    );
    
    await sendEmail({
      email: employee.user.email,
      ...template
    });
  },

  // Send payroll generated notification
  sendPayrollNotification: async (payroll, employee) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const template = emailTemplates.payrollGenerated(
      employee.user.name,
      months[payroll.payrollPeriod.month - 1],
      payroll.payrollPeriod.year,
      payroll.netSalary
    );
    
    await sendEmail({
      email: employee.user.email,
      ...template
    });
  },

  // Send announcement notification
  sendAnnouncementNotification: async (announcement, users) => {
    const template = emailTemplates.announcement(
      announcement.title,
      announcement.message,
      announcement.priority
    );
    
    const emailPromises = users.map(user => 
      sendEmail({
        email: user.email,
        ...template
      })
    );
    
    await Promise.all(emailPromises);
  },

  // Send birthday wishes
  sendBirthdayWishes: async (employee) => {
    const template = emailTemplates.birthday(employee.user.name);
    
    await sendEmail({
      email: employee.user.email,
      ...template
    });
  }
};

export default emailUtils;