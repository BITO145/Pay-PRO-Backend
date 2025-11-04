import Holiday from '../models/Holiday.js';
import logger from '../config/logger.js';
import moment from 'moment';

// @desc    Create new holiday
// @route   POST /api/holidays
// @access  Admin/HR
export const createHoliday = async (req, res) => {
  try {
    const {
      name,
      date,
      type,
      description,
      isRecurring,
      applicableRegions,
      applicableDepartments
    } = req.body;

    // Check if holiday already exists for this date
    const existingHoliday = await Holiday.findOne({
      date: new Date(date)
    });

    if (existingHoliday) {
      return res.status(400).json({
        success: false,
        error: 'Holiday already exists for this date'
      });
    }

    const holiday = new Holiday({
      name,
      date: new Date(date),
      type,
      description,
      isRecurring,
      applicableRegions,
      applicableDepartments,
      createdBy: req.user._id
    });

    await holiday.save();

    // Populate creator details
    await holiday.populate('createdBy', 'name email');

    logger.info(`Holiday created successfully`, {
      holidayId: holiday._id,
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      data: holiday
    });

  } catch (error) {
    logger.error('Error in createHoliday:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create holiday'
    });
  }
};

// @desc    Get holidays with filtering
// @route   GET /api/holidays
// @access  All authenticated users
export const getHolidays = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      year,
      month,
      type,
      region,
      department,
      upcoming = false,
      search,
      sortBy = 'date',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};

    // Filter by year
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      filter.date = { $gte: startDate, $lte: endDate };
    }

    // Filter by month (requires year)
    if (month && year) {
      const startDate = new Date(`${year}-${month.padStart(2, '0')}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // Last day of the month
      filter.date = { $gte: startDate, $lte: endDate };
    }

    // Filter by type
    if (type) {
      filter.type = type;
    }

    // Filter by region
    if (region) {
      filter.applicableRegions = { $in: [region] };
    }

    // Filter by department
    if (department) {
      filter.applicableDepartments = { $in: [department] };
    }

    // Filter upcoming holidays
    if (upcoming === 'true') {
      filter.date = { $gte: new Date() };
    }

    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const holidays = await Holiday.find(filter)
      .populate('createdBy', 'name email')
      .populate('applicableDepartments', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Holiday.countDocuments(filter);

    // Add additional info for each holiday
    const holidaysWithInfo = holidays.map(holiday => {
      const holidayObj = holiday.toObject();
      const now = new Date();
      const holidayDate = new Date(holiday.date);
      
      // Calculate days until holiday
      const diffTime = holidayDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        ...holidayObj,
        daysUntil: diffDays,
        isPast: diffDays < 0,
        isToday: diffDays === 0,
        isUpcoming: diffDays > 0
      };
    });

    res.status(200).json({
      success: true,
      data: holidaysWithInfo,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Error in getHolidays:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch holidays'
    });
  }
};

// @desc    Get holiday by ID
// @route   GET /api/holidays/:id
// @access  All authenticated users
export const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await Holiday.findById(id)
      .populate('createdBy', 'name email')
      .populate('applicableDepartments', 'name');

    if (!holiday) {
      return res.status(404).json({
        success: false,
        error: 'Holiday not found'
      });
    }

    // Add additional info
    const now = new Date();
    const holidayDate = new Date(holiday.date);
    const diffTime = holidayDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const holidayWithInfo = {
      ...holiday.toObject(),
      daysUntil: diffDays,
      isPast: diffDays < 0,
      isToday: diffDays === 0,
      isUpcoming: diffDays > 0
    };

    res.status(200).json({
      success: true,
      data: holidayWithInfo
    });

  } catch (error) {
    logger.error('Error in getHolidayById:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch holiday'
    });
  }
};

// @desc    Update holiday
// @route   PUT /api/holidays/:id
// @access  Admin/HR
export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const holiday = await Holiday.findById(id);
    if (!holiday) {
      return res.status(404).json({
        success: false,
        error: 'Holiday not found'
      });
    }

    // Check if new date conflicts with existing holiday
    if (updates.date) {
      const conflictingHoliday = await Holiday.findOne({
        _id: { $ne: id },
        date: new Date(updates.date)
      });

      if (conflictingHoliday) {
        return res.status(400).json({
          success: false,
          error: 'Another holiday already exists for this date'
        });
      }

      updates.date = new Date(updates.date);
    }

    const updatedHoliday = await Holiday.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('applicableDepartments', 'name');

    logger.info(`Holiday updated successfully`, {
      holidayId: id,
      updatedBy: req.user._id,
      updates: Object.keys(updates)
    });

    res.status(200).json({
      success: true,
      message: 'Holiday updated successfully',
      data: updatedHoliday
    });

  } catch (error) {
    logger.error('Error in updateHoliday:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update holiday'
    });
  }
};

// @desc    Get upcoming holidays
// @route   GET /api/holidays/upcoming
// @access  All authenticated users
export const getUpcomingHolidays = async (req, res) => {
  try {
    const { limit = 5, days = 30 } = req.query;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(days));

    const holidays = await Holiday.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('applicableDepartments', 'name')
    .sort({ date: 1 })
    .limit(parseInt(limit));

    // Add days until each holiday
    const holidaysWithDays = holidays.map(holiday => {
      const diffTime = new Date(holiday.date) - new Date();
      const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        ...holiday.toObject(),
        daysUntil
      };
    });

    res.status(200).json({
      success: true,
      data: holidaysWithDays,
      count: holidaysWithDays.length
    });

  } catch (error) {
    logger.error('Error in getUpcomingHolidays:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming holidays'
    });
  }
};

// @desc    Get holiday calendar
// @route   GET /api/holidays/calendar
// @access  All authenticated users
export const getHolidayCalendar = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    const holidays = await Holiday.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('applicableDepartments', 'name')
    .sort({ date: 1 });

    // Group holidays by month
    const monthlyHolidays = {};
    
    holidays.forEach(holiday => {
      const month = moment(holiday.date).format('YYYY-MM');
      if (!monthlyHolidays[month]) {
        monthlyHolidays[month] = [];
      }
      monthlyHolidays[month].push(holiday);
    });

    // Create full year calendar structure
    const calendar = {};
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      calendar[monthKey] = {
        month: month,
        monthName: moment().month(month - 1).format('MMMM'),
        holidays: monthlyHolidays[monthKey] || []
      };
    }

    // Calculate statistics
    const stats = {
      totalHolidays: holidays.length,
      byType: {},
      byMonth: {},
      totalWorkingDays: 0
    };

    holidays.forEach(holiday => {
      // Count by type
      stats.byType[holiday.type] = (stats.byType[holiday.type] || 0) + 1;
      
      // Count by month
      const monthName = moment(holiday.date).format('MMMM');
      stats.byMonth[monthName] = (stats.byMonth[monthName] || 0) + 1;
    });

    // Calculate working days (approximate)
    const totalDays = moment(`${year}-12-31`).dayOfYear();
    const weekends = Math.floor(totalDays / 7) * 2; // Approximate weekends
    stats.totalWorkingDays = totalDays - weekends - holidays.length;

    res.status(200).json({
      success: true,
      data: {
        year: parseInt(year),
        calendar,
        holidays,
        stats
      }
    });

  } catch (error) {
    logger.error('Error in getHolidayCalendar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch holiday calendar'
    });
  }
};

// @desc    Get holiday statistics
// @route   GET /api/holidays/stats
// @access  Admin/HR
export const getHolidayStats = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    // Overall statistics
    const totalHolidays = await Holiday.countDocuments({
      date: { $gte: startDate, $lte: endDate }
    });

    // Statistics by type
    const typeStats = await Holiday.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    // Statistics by month
    const monthStats = await Holiday.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $month: '$date' },
          count: { $sum: 1 },
          holidays: { $push: '$$ROOT' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Regional distribution
    const regionalStats = await Holiday.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $unwind: '$applicableRegions'
      },
      {
        $group: {
          _id: '$applicableRegions',
          count: { $sum: 1 }
        }
      }
    ]);

    // Upcoming vs past holidays
    const now = new Date();
    const upcomingHolidays = await Holiday.countDocuments({
      date: { $gte: now, $lte: endDate }
    });
    const pastHolidays = await Holiday.countDocuments({
      date: { $gte: startDate, $lt: now }
    });

    res.status(200).json({
      success: true,
      data: {
        year: parseInt(year),
        overview: {
          totalHolidays,
          upcomingHolidays,
          pastHolidays
        },
        typeDistribution: typeStats,
        monthlyDistribution: monthStats.map(stat => ({
          month: stat._id,
          monthName: moment().month(stat._id - 1).format('MMMM'),
          count: stat.count
        })),
        regionalDistribution: regionalStats
      }
    });

  } catch (error) {
    logger.error('Error in getHolidayStats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch holiday statistics'
    });
  }
};

// @desc    Bulk import holidays
// @route   POST /api/holidays/bulk-import
// @access  Admin/HR
export const bulkImportHolidays = async (req, res) => {
  try {
    const { holidays } = req.body;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of holidays'
      });
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const holidayData of holidays) {
      try {
        // Check if holiday already exists
        const existingHoliday = await Holiday.findOne({
          date: new Date(holidayData.date)
        });

        if (existingHoliday) {
          results.skipped++;
          continue;
        }

        // Create new holiday
        const holiday = new Holiday({
          ...holidayData,
          date: new Date(holidayData.date),
          createdBy: req.user._id
        });

        await holiday.save();
        results.imported++;

      } catch (error) {
        results.errors.push({
          holiday: holidayData.name,
          error: error.message
        });
      }
    }

    logger.info(`Bulk import completed`, {
      imported: results.imported,
      skipped: results.skipped,
      errors: results.errors.length,
      importedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Bulk import completed',
      data: results
    });

  } catch (error) {
    logger.error('Error in bulkImportHolidays:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import holidays'
    });
  }
};

// @desc    Delete holiday
// @route   DELETE /api/holidays/:id
// @access  Admin/HR
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await Holiday.findById(id);
    if (!holiday) {
      return res.status(404).json({
        success: false,
        error: 'Holiday not found'
      });
    }

    await Holiday.findByIdAndDelete(id);

    logger.info(`Holiday deleted successfully`, {
      holidayId: id,
      holidayName: holiday.name,
      deletedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Holiday deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deleteHoliday:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete holiday'
    });
  }
};