# Human Resource Management (HRM) System - Backend API

A comprehensive Human Resource Management system backend built with Node.js, Express.js, and MongoDB. This system provides complete HR functionalities including employee management, attendance tracking, leave management, payroll processing, and more.

## 🚀 Features

### 🔐 Authentication & Authorization
- JWT-based authentication
- Role-based access control (Admin, HR, Employee)
- Secure password hashing with bcrypt
- Password reset functionality
- Session management

### 👥 Employee Management
- Complete employee profiles
- Department and position management
- Employee onboarding workflow
- Bulk employee import/export
- Employee document management
- Performance tracking

### 📅 Attendance Management
- Real-time check-in/check-out
- GPS location tracking
- Manual attendance entry
- Attendance reports and analytics
- Overtime calculation
- Late arrival tracking

### 🏖️ Leave Management
- Multiple leave types (Sick, Casual, Annual, etc.)
- Leave application workflow
- Approval system with email notifications
- Leave balance tracking
- Leave calendar view
- Holiday management

### 💰 Payroll System
- Automated payroll generation
- Salary calculations with allowances/deductions
- Tax calculations
- Payslip generation
- Payroll reports
- Bonus and incentive management

### 🏢 Department Management
- Department creation and management
- Department-wise employee allocation
- Budget tracking
- Department head assignment

### 📢 Announcements & Notifications
- Company-wide announcements
- Targeted notifications
- Email notifications
- Priority-based messaging
- Announcement scheduling

### 📊 Reports & Analytics
- Employee reports
- Attendance analytics
- Payroll summaries
- Department statistics
- Custom report generation

## 🛠️ Technology Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens)
- **Validation:** Joi
- **File Upload:** Multer + Cloudinary
- **Email:** Nodemailer
- **Logging:** Winston
- **Security:** Helmet, CORS, Rate Limiting
- **Documentation:** Swagger/OpenAPI (planned)

## 📋 Prerequisites

Before running this project, make sure you have the following installed:

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn package manager

## ⚡ Quick Start

### 1. Clone the repository
```bash
git clone <repository-url>
cd hrm/server
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the server directory by copying from `.env.example`:
```bash
cp .env.example .env
```

Update the environment variables in `.env`:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/hrm_system
JWT_SECRET=your-super-secret-jwt-key
EMAIL_HOST=smtp.gmail.com
EMAIL_USERNAME=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 4. Start MongoDB
Make sure MongoDB is running on your system:
```bash
# On macOS with Homebrew
brew services start mongodb-community

# On Ubuntu/Debian
sudo systemctl start mongod

# On Windows
net start MongoDB
```

### 5. Run the application
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## 📁 Project Structure

```
server/
├── config/
│   ├── database.js          # MongoDB connection setup
│   └── logger.js             # Winston logger configuration
├── controllers/
│   ├── authController.js     # Authentication logic
│   ├── employeeController.js # Employee management
│   ├── attendanceController.js # Attendance tracking
│   ├── leaveController.js    # Leave management
│   ├── payrollController.js  # Payroll processing
│   ├── departmentController.js # Department management
│   ├── announcementController.js # Announcements
│   └── holidayController.js  # Holiday management
├── middleware/
│   ├── auth.js              # Authentication middleware
│   ├── validation.js        # Request validation
│   ├── upload.js           # File upload handling
│   ├── errorHandler.js     # Error handling
│   └── auditLog.js         # Audit logging
├── models/
│   ├── User.js             # User model
│   ├── Employee.js         # Employee model
│   ├── Department.js       # Department model
│   ├── Attendance.js       # Attendance model
│   ├── Leave.js            # Leave model
│   ├── Payroll.js          # Payroll model
│   ├── Announcement.js     # Announcement model
│   ├── Holiday.js          # Holiday model
│   └── AuditLog.js         # Audit log model
├── routes/
│   ├── authRoutes.js       # Authentication routes
│   ├── employeeRoutes.js   # Employee routes
│   ├── attendanceRoutes.js # Attendance routes
│   ├── leaveRoutes.js      # Leave routes
│   ├── payrollRoutes.js    # Payroll routes
│   ├── departmentRoutes.js # Department routes
│   ├── announcementRoutes.js # Announcement routes
│   └── holidayRoutes.js    # Holiday routes
├── utils/
│   ├── email.js            # Email utilities
│   └── helpers.js          # Helper functions
├── uploads/                # File upload directory
├── logs/                   # Log files
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore file
├── package.json          # Dependencies and scripts
└── server.js             # Main application file
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/forgot-password` - Forgot password
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/logout` - User logout

### Employee Management
- `POST /api/employees` - Create employee
- `GET /api/employees` - Get all employees
- `GET /api/employees/:id` - Get employee by ID
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee
- `GET /api/employees/stats` - Get employee statistics
- `POST /api/employees/bulk-import` - Bulk import employees

### Attendance
- `POST /api/attendance/check-in` - Check in
- `POST /api/attendance/check-out` - Check out
- `GET /api/attendance` - Get attendance records
- `GET /api/attendance/employee/:id` - Get employee attendance
- `POST /api/attendance/manual` - Manual attendance entry
- `GET /api/attendance/reports` - Attendance reports

### Leave Management
- `POST /api/leaves/apply` - Apply for leave
- `GET /api/leaves` - Get leave requests
- `GET /api/leaves/:id` - Get leave by ID
- `PUT /api/leaves/:id/review` - Review leave request
- `GET /api/leaves/balance/:employeeId` - Get leave balance
- `GET /api/leaves/calendar` - Leave calendar

### Payroll
- `POST /api/payroll/generate/:employeeId` - Generate payroll
- `GET /api/payroll` - Get payroll records
- `GET /api/payroll/:id` - Get payroll by ID
- `PUT /api/payroll/:id` - Update payroll
- `PATCH /api/payroll/:id/process` - Process payroll
- `GET /api/payroll/reports/summary` - Payroll reports

### Departments
- `POST /api/departments` - Create department
- `GET /api/departments` - Get all departments
- `GET /api/departments/:id` - Get department by ID
- `PUT /api/departments/:id` - Update department
- `GET /api/departments/stats` - Department statistics

### Announcements
- `POST /api/announcements` - Create announcement
- `GET /api/announcements` - Get announcements
- `GET /api/announcements/:id` - Get announcement by ID
- `PUT /api/announcements/:id` - Update announcement
- `GET /api/announcements/unread` - Get unread announcements

### Holidays
- `POST /api/holidays` - Create holiday
- `GET /api/holidays` - Get holidays
- `GET /api/holidays/:id` - Get holiday by ID
- `PUT /api/holidays/:id` - Update holiday
- `GET /api/holidays/upcoming` - Get upcoming holidays
- `GET /api/holidays/calendar` - Holiday calendar

## 🔒 Security Features

- **JWT Authentication:** Secure token-based authentication
- **Password Hashing:** Bcrypt with salt rounds
- **Rate Limiting:** API request rate limiting
- **CORS Protection:** Cross-origin request handling
- **Helmet Security:** Security headers
- **Input Validation:** Joi validation schemas
- **Audit Logging:** Complete audit trail
- **File Upload Security:** Secure file handling with Cloudinary

## 📧 Email Configuration

The system uses Nodemailer for email notifications. Configure your email settings in the `.env` file:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USERNAME=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

### Gmail Setup:
1. Enable 2-factor authentication
2. Generate an app password
3. Use the app password in `EMAIL_PASSWORD`

## 📁 File Upload Configuration

Files are uploaded to Cloudinary for cloud storage. Set up your Cloudinary account:

1. Create a free account at [Cloudinary](https://cloudinary.com)
2. Get your cloud name, API key, and API secret
3. Add them to your `.env` file

## 🗄️ Database Schema

### Key Collections:
- **users:** User authentication and profile data
- **employees:** Employee information and HR data
- **departments:** Department structure and management
- **attendance:** Daily attendance tracking
- **leaves:** Leave applications and approvals
- **payroll:** Salary and payroll information
- **announcements:** Company announcements
- **holidays:** Holiday calendar
- **auditlogs:** System audit trail

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📝 Logging

The application uses Winston for comprehensive logging:

- **Console Logging:** Development environment
- **File Logging:** Production environment with rotation
- **Error Logging:** Separate error log files
- **Audit Logging:** User activity tracking

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | No (default: 5000) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT secret key | Yes |
| `JWT_EXPIRES_IN` | JWT expiration time | No (default: 7d) |
| `EMAIL_HOST` | SMTP host | Yes |
| `EMAIL_USERNAME` | Email username | Yes |
| `EMAIL_PASSWORD` | Email password | Yes |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |

## 🚀 Deployment

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name "hrm-api"

# Monitor the application
pm2 monit

# View logs
pm2 logs hrm-api
```

### Using Docker

```dockerfile
# Dockerfile (create this file)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t hrm-api .
docker run -p 5000:5000 --env-file .env hrm-api
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

1. Create an issue in the GitHub repository
2. Contact the development team
3. Check the documentation

## 🔄 Changelog

### v1.0.0
- Initial release
- Complete HR management system
- Authentication and authorization
- Employee management
- Attendance tracking
- Leave management
- Payroll processing
- Department management
- Announcements and notifications
- Holiday management
- Comprehensive reporting

---

**Built with ❤️ for modern HR management needs**