import Attendance from "../models/Attendance.js";
import Employee from "../models/Employee.js";
import Holiday from "../models/Holiday.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { dataLogger } from "../config/logger.js";
import { dateUtils, searchUtils } from "../utils/helpers.js";
import { v2 as cloudinary } from "cloudinary";

// Office timing configuration (matches client expectations and auto-stop logic)
const OFFICE_START_HOUR = 9;
const OFFICE_START_MINUTE = 30;
const OFFICE_END_HOUR = 18;
const OFFICE_END_MINUTE = 30;
const MIN_PRESENT_MINUTES = 270; // 4.5 hours

const getDayStart = (d = new Date()) => {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
};

const getOfficeEnd = (d = new Date()) => {
  const end = getDayStart(d);
  end.setHours(OFFICE_END_HOUR, OFFICE_END_MINUTE, 0, 0);
  return end;
};

const getOfficeStart = (d = new Date()) => {
  const start = getDayStart(d);
  start.setHours(OFFICE_START_HOUR, OFFICE_START_MINUTE, 0, 0);
  return start;
};

const isAfterHalfOfOfficeTime = (d = new Date()) => {
  const start = getOfficeStart(d);
  const end = getOfficeEnd(d);
  const durationMs = end.getTime() - start.getTime();
  const halfPoint = new Date(start.getTime() + durationMs / 2);
  return d.getTime() > halfPoint.getTime();
};

const computeWorkedMinutes = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  return Math.max(
    0,
    Math.floor(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000
    )
  );
};

// Upload attendance image from memory buffer to Cloudinary and return the URL
const uploadAttendanceBuffer = async (buffer, filename = "attendance.jpg") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hrm/attendance-images",
        resource_type: "image",
        public_id: undefined,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        transformation: [
          { width: 1000, height: 1000, crop: "limit", quality: "auto" },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        // Prefer secure_url when available
        return resolve(result?.secure_url || result?.url);
      }
    );
    stream.end(buffer);
  });
};

// @desc    Mark attendance (Check-in/Check-out)
// @route   POST /api/attendance/mark
// @access  Private (Employee)
export const markAttendance = asyncHandler(async (req, res) => {
  const { type, location } = req.body; // type: 'checkin' or 'checkout'

  // Get employee record
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: "Employee record not found",
    });
  }

  const today = getDayStart(new Date());

  // Check if today is a holiday
  const isHoliday = await Holiday.isHoliday(new Date(), req.user._id);
  if (isHoliday) {
    return res.status(400).json({
      success: false,
      message: `Today is a holiday: ${isHoliday.name}. Attendance cannot be marked.`,
    });
  }

  // Check if it's weekend
  if (dateUtils.isWeekend(new Date())) {
    return res.status(400).json({
      success: false,
      message: "Attendance cannot be marked on weekends",
    });
  }

  // Find or create today's attendance record
  let attendance = await Attendance.findOne({
    employee: employee._id,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  const now = new Date();
  const officeEnd = getOfficeEnd(now);

  if (type === "checkin") {
    // Enforce image upload for check-in
    if (!req.file || !req.file.buffer) {
      return res
        .status(400)
        .json({ success: false, message: "Punch-in image is required" });
    }
    // Check if already checked in
    if (attendance && attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: "You have already checked in today",
      });
    }
    // Disallow check-in after office end time
    if (now > officeEnd) {
      return res.status(400).json({
        success: false,
        message: "Office time ended. Check-in is closed for today.",
      });
    }
    // Disallow check-in after more than 50% of office time has passed
    if (isAfterHalfOfOfficeTime(now)) {
      return res.status(400).json({
        success: false,
        message:
          "Check-in is disabled after mid-shift. Please contact HR for assistance.",
      });
    }

    // Upload image to Cloudinary (memory buffer)
    let punchInImageUrl;
    try {
      punchInImageUrl = await uploadAttendanceBuffer(
        req.file.buffer,
        req.file.originalname
      );
    } catch (err) {
      return res
        .status(500)
        .json({
          success: false,
          message: "Failed to upload punch-in image",
          error: err?.message || String(err),
        });
    }

    // Create or update attendance record
    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: today,
        checkIn: now,
        // Set initial status conservatively; final status will be computed at checkout/auto-stop
        status: "Absent",
        sessionStatus: "active",
        location: {
          checkInLocation: location,
        },
        ipAddress: {
          checkInIP: req.ip,
        },
        punchInImageUrl,
      });
    } else {
      attendance.checkIn = now;
      // Keep initial status conservative until checkout/auto-stop recalculates
      attendance.status = "Absent";
      attendance.sessionStatus = "active";
      attendance.location.checkInLocation = location;
      attendance.ipAddress.checkInIP = req.ip;
      attendance.punchInImageUrl = punchInImageUrl;
    }
  } else if (type === "checkout") {
    // Check if not checked in yet
    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: "You need to check in first",
      });
    }

    // If already checked out (manually or auto-stopped), allow uploading punch-out image until 23:59 if missing
    if (attendance.checkOut) {
      if (!attendance.punchOutImageUrl) {
        if (!req.file || !req.file.buffer) {
          return res
            .status(400)
            .json({ success: false, message: "Punch-out image is required" });
        }
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        if (now > endOfDay) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Punch-out image upload window has closed for today",
            });
        }
        try {
          const punchOutUrl = await uploadAttendanceBuffer(
            req.file.buffer,
            req.file.originalname
          );
          attendance.punchOutImageUrl = punchOutUrl;
        } catch (err) {
          return res
            .status(500)
            .json({
              success: false,
              message: "Failed to upload punch-out image",
              error: err?.message || String(err),
            });
        }
        await attendance.save();
        dataLogger.update("Attendance", attendance._id, req.user._id, req.ip, {
          action: "upload_punch_out_image_only",
        });
        return res
          .status(200)
          .json({
            success: true,
            message: "Punch-out image uploaded successfully",
            data: attendance,
          });
      }
      return res
        .status(400)
        .json({
          success: false,
          message: "You have already checked out today",
        });
    }

    // Enforce image upload for punch-out
    if (!req.file || !req.file.buffer) {
      return res
        .status(400)
        .json({ success: false, message: "Punch-out image is required" });
    }
    let punchOutImageUrl;
    try {
      punchOutImageUrl = await uploadAttendanceBuffer(
        req.file.buffer,
        req.file.originalname
      );
    } catch (err) {
      return res
        .status(500)
        .json({
          success: false,
          message: "Failed to upload punch-out image",
          error: err?.message || String(err),
        });
    }
    const actualCheckout = now > officeEnd ? officeEnd : now;
    attendance.checkOut = actualCheckout;
    attendance.location.checkOutLocation = location;
    attendance.ipAddress.checkOutIP = req.ip;
    attendance.punchOutImageUrl = punchOutImageUrl;

    // Compute work duration and final attendance status (Present if >= 4.5 hours)
    const workedMinutes = computeWorkedMinutes(
      attendance.checkIn,
      attendance.checkOut
    );
    const isPresent = workedMinutes >= MIN_PRESENT_MINUTES;
    attendance.status = isPresent ? "Present" : "Absent";
    attendance.sessionStatus = now > officeEnd ? "auto-stopped" : "completed";
  }

  await attendance.save();

  // Log the action
  dataLogger.create("Attendance", attendance._id, req.user._id, req.ip);

  res.status(200).json({
    success: true,
    message: `${
      type === "checkin" ? "Checked in" : "Checked out"
    } successfully`,
    data: attendance,
  });
});

// Pre-check middleware to avoid uploading image to Cloudinary when check-in is not allowed
export const preCheckBeforeUpload = asyncHandler(async (req, res, next) => {
  try {
    const { type } = req.body || {};
    // Only enforce pre-checks for check-in flow
    if (type !== "checkin") return next();

    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee record not found" });
    }

    const now = new Date();
    const today = getDayStart(now);
    const officeEnd = getOfficeEnd(now);

    // Weekend / Holiday
    if (dateUtils.isWeekend(now)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Attendance cannot be marked on weekends",
        });
    }
    const isHoliday = await Holiday.isHoliday(now, req.user._id);
    if (isHoliday) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Today is a holiday: ${isHoliday.name}. Attendance cannot be marked.`,
        });
    }

    // Already checked in
    const existing = await Attendance.findOne({
      employee: employee._id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    if (existing && existing.checkIn) {
      return res
        .status(400)
        .json({ success: false, message: "You have already checked in today" });
    }

    // Time-based checks
    if (now > officeEnd) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Office time ended. Check-in is closed for today.",
        });
    }
    if (isAfterHalfOfOfficeTime(now)) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Check-in is disabled after mid-shift. Please contact HR for assistance.",
        });
    }

    return next();
  } catch (e) {
    return next(e);
  }
});

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
export const getAttendance = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    employee,
    startDate,
    endDate,
    status,
    sortBy = "date",
    sortOrder = "desc",
  } = req.query;

  let query = {};

  // If user is employee, can only see own records
  if (req.user.role === "employee") {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (!employeeRecord) {
      return res.status(404).json({
        success: false,
        message: "Employee record not found",
      });
    }
    query.employee = employeeRecord._id;
  } else if (employee) {
    // HR/Admin can filter by specific employee
    query.employee = employee;
  }

  // Add date range filter
  if (startDate || endDate) {
    query = {
      ...query,
      ...searchUtils.createDateRangeFilter(startDate, endDate, "date"),
    };
  }

  // Add status filter
  if (status) {
    query.status = status;
  }

  // Pagination
  const { skip, limit: limitNum } = searchUtils.getPaginationOptions(
    page,
    limit
  );

  // Sort options
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

  const attendanceRecords = await Attendance.find(query)
    .populate("employee", "employeeCode user")
    .populate("employee.user", "name email")
    .sort(sortOptions)
    .skip(skip)
    .limit(limitNum);

  const total = await Attendance.countDocuments(query);

  res.status(200).json({
    success: true,
    data: attendanceRecords,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil(total / limitNum),
      total,
      limit: limitNum,
    },
  });
});

// @desc    Get single attendance record
// @route   GET /api/attendance/:id
// @access  Private
export const getAttendanceById = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id)
    .populate("employee", "employeeCode user designation")
    .populate("employee.user", "name email");

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance record not found",
    });
  }

  // Check if user can access this record
  if (req.user.role === "employee") {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (
      !employeeRecord ||
      attendance.employee._id.toString() !== employeeRecord._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only access your own attendance records",
      });
    }
  }

  res.status(200).json({
    success: true,
    data: attendance,
  });
});

// @desc    Update attendance record (Manual entry by HR/Admin)
// @route   PUT /api/attendance/:id
// @access  Private (HR/Admin)
export const updateAttendance = asyncHandler(async (req, res) => {
  let attendance = await Attendance.findById(req.params.id);

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance record not found",
    });
  }

  const { checkIn, checkOut, status, remarks } = req.body;

  // Store old data for audit
  const oldData = attendance.toObject();

  // Update fields
  const fieldsToUpdate = {};
  if (checkIn) fieldsToUpdate.checkIn = new Date(checkIn);
  if (checkOut) fieldsToUpdate.checkOut = new Date(checkOut);
  if (status) fieldsToUpdate.status = status;
  if (remarks) fieldsToUpdate.remarks = remarks;

  attendance = await Attendance.findByIdAndUpdate(
    req.params.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true,
    }
  ).populate("employee", "employeeCode user");

  // Log the update
  dataLogger.update("Attendance", attendance._id, req.user._id, req.ip, {
    before: oldData,
    after: attendance.toObject(),
  });

  res.status(200).json({
    success: true,
    message: "Attendance record updated successfully",
    data: attendance,
  });
});

// @desc    Create manual attendance entry
// @route   POST /api/attendance/manual
// @access  Private (HR/Admin)
export const createManualAttendance = asyncHandler(async (req, res) => {
  const { employee, date, checkIn, checkOut, status, remarks } = req.body;

  // Check if attendance already exists for this date
  const existingAttendance = await Attendance.findOne({
    employee,
    date: {
      $gte: new Date(date),
      $lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
    },
  });

  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      message: "Attendance record already exists for this date",
    });
  }

  const attendance = await Attendance.create({
    employee,
    date: new Date(date),
    checkIn: checkIn ? new Date(checkIn) : null,
    checkOut: checkOut ? new Date(checkOut) : null,
    status,
    remarks,
    approvedBy: req.user._id,
  });

  await attendance.populate("employee", "employeeCode user");

  // Log the creation
  dataLogger.create("Attendance", attendance._id, req.user._id, req.ip);

  res.status(201).json({
    success: true,
    message: "Manual attendance entry created successfully",
    data: attendance,
  });
});

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Private (HR/Admin)
export const deleteAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance record not found",
    });
  }

  await attendance.deleteOne();

  // Log the deletion
  dataLogger.delete("Attendance", req.params.id, req.user._id, req.ip);

  res.status(200).json({
    success: true,
    message: "Attendance record deleted successfully",
  });
});

// @desc    Get attendance summary
// @route   GET /api/attendance/summary
// @access  Private
export const getAttendanceSummary = asyncHandler(async (req, res) => {
  const { employee, startDate, endDate, period = "month" } = req.query;

  let employeeId = employee;

  // If user is employee, can only see own summary
  if (req.user.role === "employee") {
    const employeeRecord = await Employee.findOne({ user: req.user._id });
    if (!employeeRecord) {
      return res.status(404).json({
        success: false,
        message: "Employee record not found",
      });
    }
    employeeId = employeeRecord._id;
  }

  // Calculate date range based on period
  let start, end;
  const now = new Date();

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === "year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }

  const summary = await Attendance.getAttendanceSummary(employeeId, start, end);

  // Get working days in the period
  const totalWorkingDays = dateUtils.getWorkingDaysInMonth(
    start.getFullYear(),
    start.getMonth() + 1
  );

  // Calculate additional metrics
  const presentDays = summary.find((s) => s._id === "Present")?.count || 0;
  const absentDays = summary.find((s) => s._id === "Absent")?.count || 0;
  const leaveDays = summary.find((s) => s._id === "Leave")?.count || 0;
  const halfDays = summary.find((s) => s._id === "Half Day")?.count || 0;

  const attendancePercentage =
    ((presentDays + halfDays * 0.5) / totalWorkingDays) * 100;

  res.status(200).json({
    success: true,
    data: {
      period: { start, end },
      totalWorkingDays,
      presentDays,
      absentDays,
      leaveDays,
      halfDays,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100,
      totalWorkingHours: summary.reduce(
        (sum, s) => sum + (s.totalWorkingHours || 0),
        0
      ),
      totalOvertimeHours: summary.reduce(
        (sum, s) => sum + (s.totalOvertimeHours || 0),
        0
      ),
      breakdown: summary,
    },
  });
});

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private (Employee)
export const getTodayAttendance = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user._id });
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: "Employee record not found",
    });
  }

  const now = new Date();
  const today = getDayStart(now);
  const officeEnd = getOfficeEnd(now);

  let attendance = await Attendance.findOne({
    employee: employee._id,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    },
  });
  // Auto-stop if past office end and still active
  if (
    attendance &&
    attendance.checkIn &&
    !attendance.checkOut &&
    now > officeEnd
  ) {
    attendance.checkOut = officeEnd;
    const workedMinutes = computeWorkedMinutes(
      attendance.checkIn,
      attendance.checkOut
    );
    attendance.status =
      workedMinutes >= MIN_PRESENT_MINUTES ? "Present" : "Absent";
    attendance.sessionStatus = "auto-stopped";
    await attendance.save();
  }

  // Check if today is a holiday
  const isHoliday = await Holiday.isHoliday(new Date(), req.user._id);

  res.status(200).json({
    success: true,
    data: {
      attendance,
      punchInTime: attendance?.checkIn || null,
      punchOutTime: attendance?.checkOut || null,
      currentStatus: attendance
        ? attendance.checkIn && !attendance.checkOut && now <= officeEnd
          ? "active"
          : "stopped"
        : "idle",
      canCheckIn:
        !dateUtils.isWeekend(new Date()) &&
        !isHoliday &&
        !attendance?.checkIn &&
        !isAfterHalfOfOfficeTime(now) &&
        now <= officeEnd,
      checkInDisabledReason: (() => {
        if (dateUtils.isWeekend(new Date())) return "Weekend";
        if (isHoliday) return `Holiday: ${isHoliday.name}`;
        if (attendance?.checkIn) return "Already checked in";
        if (now > officeEnd) return "Office time ended";
        if (isAfterHalfOfOfficeTime(now)) return "Mid-shift passed";
        return null;
      })(),
      isWeekend: dateUtils.isWeekend(new Date()),
      isHoliday: isHoliday
        ? { name: isHoliday.name, type: isHoliday.type }
        : null,
      canMarkAttendance:
        !dateUtils.isWeekend(new Date()) &&
        !isHoliday &&
        !isAfterHalfOfOfficeTime(now) &&
        now <= officeEnd,
    },
  });
});

// @desc    Get attendance report for export
// @route   GET /api/attendance/report
// @access  Private (HR/Admin)
export const getAttendanceReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, department, format = "json" } = req.query;

  let query = {};

  // Add date range filter
  if (startDate || endDate) {
    query = {
      ...query,
      ...searchUtils.createDateRangeFilter(startDate, endDate, "date"),
    };
  }

  // Add department filter
  if (department) {
    const employees = await Employee.find({ department }).select("_id");
    query.employee = { $in: employees.map((emp) => emp._id) };
  }

  const attendanceData = await Attendance.find(query)
    .populate({
      path: "employee",
      select: "employeeCode user designation department",
      populate: [
        { path: "user", select: "name email" },
        { path: "department", select: "name" },
      ],
    })
    .sort({ date: -1 });

  // Log the export
  dataLogger.export(
    "Attendance Report",
    req.user._id,
    req.ip,
    attendanceData.length
  );

  if (format === "csv") {
    // Convert to CSV format
    const csv = convertToCSV(attendanceData);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=attendance-report.csv"
    );
    return res.send(csv);
  }

  res.status(200).json({
    success: true,
    data: attendanceData,
    summary: {
      totalRecords: attendanceData.length,
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
    },
  });
});

// Helper function to convert data to CSV
const convertToCSV = (data) => {
  const headers = [
    "Date",
    "Employee Code",
    "Employee Name",
    "Department",
    "Check In",
    "Check Out",
    "Status",
    "Working Hours",
    "Overtime Hours",
  ];

  let csv = headers.join(",") + "\n";

  data.forEach((record) => {
    const row = [
      dateUtils.formatDate(record.date, "YYYY-MM-DD"),
      record.employee.employeeCode,
      record.employee.user.name,
      record.employee.department?.name || "",
      record.checkIn ? dateUtils.formatDate(record.checkIn, "HH:mm:ss") : "",
      record.checkOut ? dateUtils.formatDate(record.checkOut, "HH:mm:ss") : "",
      record.status,
      record.workingHours || 0,
      record.overtimeHours || 0,
    ];
    csv += row.join(",") + "\n";
  });

  return csv;
};

export default {
  markAttendance,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  createManualAttendance,
  deleteAttendance,
  getAttendanceSummary,
  getTodayAttendance,
  getAttendanceReport,
};
