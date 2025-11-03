# HRM System API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

## Authentication Endpoints

### Register User
**POST** `/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "employee", // Optional: "admin", "hr", "employee"
  "phone": "+1234567890", // Optional
  "address": "123 Main St" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "jwt-token",
    "user": {
      "_id": "user-id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "employee",
      "isActive": true
    }
  }
}
```

### Login User
**POST** `/auth/login`

Authenticate user and get access token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt-token",
    "user": {
      "_id": "user-id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "employee",
      "employee": "employee-id" // If linked to employee
    }
  }
}
```

### Get User Profile
**GET** `/auth/profile`

Get current user profile information.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "employee",
    "phone": "+1234567890",
    "address": "123 Main St",
    "employee": {
      // Employee details if linked
    }
  }
}
```

## Employee Management

### Create Employee
**POST** `/employees`

Create a new employee record.

**Headers:** `Authorization: Bearer <token>` (Admin/HR only)

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "employeeId": "EMP001",
  "department": "department-id",
  "position": "Software Developer",
  "dateOfJoining": "2024-01-15",
  "employmentType": "full-time",
  "workLocation": "office",
  "salary": {
    "basic": 50000,
    "hra": 5000,
    "allowance": 2000,
    "deductions": 1000
  },
  "phone": "+1234567890",
  "address": "456 Oak St",
  "personalDetails": {
    "dateOfBirth": "1990-05-15",
    "gender": "female",
    "maritalStatus": "single",
    "bloodGroup": "O+",
    "emergencyContact": {
      "name": "John Smith",
      "relationship": "Brother",
      "phone": "+0987654321"
    }
  }
}
```

### Get All Employees
**GET** `/employees`

Get list of employees with filtering and pagination.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `search` - Search term
- `department` - Filter by department ID
- `status` - Filter by status (active/inactive)
- `sortBy` - Sort field (default: name)
- `sortOrder` - asc/desc (default: asc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "employee-id",
      "name": "Jane Smith",
      "email": "jane@company.com",
      "employeeId": "EMP001",
      "department": {
        "name": "Engineering",
        "code": "ENG"
      },
      "position": "Software Developer",
      "status": "active"
      // ... other fields
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "itemsPerPage": 10
  }
}
```

## Attendance Management

### Check In
**POST** `/attendance/check-in`

Record employee check-in time.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "New York, NY"
  },
  "notes": "Regular check-in"
}
```

### Check Out
**POST** `/attendance/check-out`

Record employee check-out time.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "New York, NY"
  },
  "notes": "End of day"
}
```

### Get Attendance Records
**GET** `/attendance`

Get attendance records with filtering.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `employee` - Employee ID (optional for admins/HR)
- `date` - Specific date (YYYY-MM-DD)
- `startDate` - Date range start
- `endDate` - Date range end
- `status` - Filter by status

## Leave Management

### Apply for Leave
**POST** `/leaves/apply`

Submit a new leave application.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "type": "sick",
  "startDate": "2024-02-01",
  "endDate": "2024-02-03",
  "reason": "Medical treatment required",
  "isHalfDay": false,
  "emergencyContact": {
    "name": "John Doe",
    "phone": "+1234567890",
    "relationship": "Spouse"
  }
}
```

### Review Leave Request
**PUT** `/leaves/:id/review`

Approve or reject leave request (Admin/HR only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "status": "approved", // or "rejected"
  "reviewNotes": "Approved for medical reasons"
}
```

## Payroll Management

### Generate Payroll
**POST** `/payroll/generate/:employeeId`

Generate payroll for an employee (Admin/HR only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "payPeriodStart": "2024-01-01",
  "payPeriodEnd": "2024-01-31",
  "basicSalary": 50000,
  "allowances": [
    {
      "name": "House Rent Allowance",
      "amount": 5000,
      "type": "fixed"
    }
  ],
  "deductions": [
    {
      "name": "Tax",
      "amount": 2000,
      "type": "tax"
    }
  ],
  "bonuses": [
    {
      "name": "Performance Bonus",
      "amount": 3000,
      "type": "performance"
    }
  ],
  "overtimeHours": 10,
  "notes": "Regular monthly payroll"
}
```

## Department Management

### Create Department
**POST** `/departments`

Create a new department (Admin/HR only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Engineering",
  "code": "ENG",
  "description": "Software development team",
  "head": "employee-id", // Optional
  "budget": 1000000 // Optional
}
```

### Get Departments
**GET** `/departments`

Get list of all departments.

**Headers:** `Authorization: Bearer <token>`

## Announcements

### Create Announcement
**POST** `/announcements`

Create a new announcement (Admin/HR only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Office Holiday Notice",
  "content": "The office will be closed on December 25th for Christmas.",
  "type": "general",
  "priority": "medium",
  "targetAudience": "all",
  "isEmailNotification": true,
  "scheduledFor": "2024-12-20T09:00:00Z",
  "expiresAt": "2024-12-26T00:00:00Z"
}
```

### Get Unread Announcements
**GET** `/announcements/unread`

Get unread announcements for current user.

**Headers:** `Authorization: Bearer <token>`

## Holiday Management

### Create Holiday
**POST** `/holidays`

Add a new holiday (Admin/HR only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Christmas",
  "date": "2024-12-25",
  "type": "national",
  "description": "Christmas Day celebration",
  "isRecurring": true,
  "applicableRegions": ["all"],
  "applicableDepartments": []
}
```

### Get Holiday Calendar
**GET** `/holidays/calendar`

Get holiday calendar for a specific year.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `year` - Year (default: current year)

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Duplicate resource |
| 422 | Validation Error - Invalid data format |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |

## Rate Limiting

API requests are limited to:
- **Development:** 1000 requests per 15 minutes per IP
- **Production:** 100 requests per 15 minutes per IP

## File Uploads

File uploads are handled via Cloudinary with the following limits:
- Maximum file size: 5MB
- Supported formats: JPG, PNG, PDF, DOC, DOCX
- Files are uploaded to `/api/upload` endpoint

## Pagination

List endpoints support pagination with the following parameters:
- `page` - Page number (starts from 1)
- `limit` - Number of items per page (max 100)

Response includes pagination metadata:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 100,
    "itemsPerPage": 10
  }
}
```

## Date Formats

All dates should be in ISO 8601 format:
- `YYYY-MM-DD` for dates
- `YYYY-MM-DDTHH:mm:ssZ` for timestamps

## Search and Filtering

Most list endpoints support search and filtering:
- `search` - Text search across relevant fields
- Field-specific filters (varies by endpoint)
- `sortBy` and `sortOrder` for custom sorting