import Announcement from '../models/Announcement.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import { sendEmail } from '../utils/email.js';
import logger from '../config/logger.js';

// @desc    Create new announcement
// @route   POST /api/announcements
// @access  Admin/HR
export const createAnnouncement = async (req, res) => {
  try {
    const {
      title,
      content,
      type,
      priority,
      targetAudience,
      targetDepartments,
      targetEmployees,
      isEmailNotification,
      scheduledFor,
      expiresAt
    } = req.body;

    const announcement = new Announcement({
      title,
      content,
      type,
      priority,
      targetAudience,
      targetDepartments,
      targetEmployees,
      isEmailNotification,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: req.user._id
    });

    await announcement.save();

    // Populate creator details
    await announcement.populate('createdBy', 'name email');

    // Send email notifications if enabled
    if (isEmailNotification) {
      try {
        await sendAnnouncementNotifications(announcement);
      } catch (emailError) {
        logger.error('Failed to send announcement notifications:', emailError);
        // Don't fail the announcement creation if email fails
      }
    }

    logger.info(`Announcement created successfully`, {
      announcementId: announcement._id,
      title: announcement.title,
      type: announcement.type,
      targetAudience: announcement.targetAudience,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });

  } catch (error) {
    logger.error('Error in createAnnouncement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create announcement'
    });
  }
};

// @desc    Get announcements with filtering
// @route   GET /api/announcements
// @access  All authenticated users
export const getAnnouncements = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      priority,
      status = 'active',
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    // Filter by type
    if (type) {
      filter.type = type;
    }

    // Filter by priority
    if (priority) {
      filter.priority = priority;
    }

    // Filter by status
    if (status === 'active') {
      filter.isActive = true;
      filter.$or = [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ];
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter.expiresAt = { $lte: new Date() };
    }

    // Filter by scheduled time (only show current and past announcements)
    filter.scheduledFor = { $lte: new Date() };

    // Search functionality
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter announcements based on user's access
    const userFilter = await buildUserAnnouncementFilter(req.user);
    Object.assign(filter, userFilter);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'name email')
      .populate('targetDepartments', 'name code')
      .populate('targetEmployees', 'name email employeeId')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Announcement.countDocuments(filter);

    // Mark announcements as read for the current user
    const unreadIds = announcements
      .filter(ann => !ann.readBy.includes(req.user._id))
      .map(ann => ann._id);

    if (unreadIds.length > 0) {
      await Announcement.updateMany(
        { _id: { $in: unreadIds } },
        { $addToSet: { readBy: req.user._id } }
      );
    }

    res.status(200).json({
      success: true,
      data: announcements,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Error in getAnnouncements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcements'
    });
  }
};

// @desc    Get announcement by ID
// @route   GET /api/announcements/:id
// @access  All authenticated users (with access check)
export const getAnnouncementById = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findById(id)
      .populate('createdBy', 'name email')
      .populate('targetDepartments', 'name code')
      .populate('targetEmployees', 'name email employeeId');

    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: 'Announcement not found'
      });
    }

    // Check if user has access to this announcement
    const hasAccess = await checkAnnouncementAccess(announcement, req.user);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Mark as read if not already
    if (!announcement.readBy.includes(req.user._id)) {
      announcement.readBy.push(req.user._id);
      await announcement.save();
    }

    res.status(200).json({
      success: true,
      data: announcement
    });

  } catch (error) {
    logger.error('Error in getAnnouncementById:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcement'
    });
  }
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Admin/HR
export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: 'Announcement not found'
      });
    }

    // Check if user can update this announcement
    if (req.user.role !== 'admin' && announcement.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own announcements'
      });
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('targetDepartments', 'name code')
     .populate('targetEmployees', 'name email employeeId');

    logger.info(`Announcement updated successfully`, {
      announcementId: id,
      updatedBy: req.user._id,
      updates: Object.keys(updates)
    });

    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
      data: updatedAnnouncement
    });

  } catch (error) {
    logger.error('Error in updateAnnouncement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update announcement'
    });
  }
};

// @desc    Toggle announcement status
// @route   PATCH /api/announcements/:id/toggle-status
// @access  Admin/HR
export const toggleAnnouncementStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: 'Announcement not found'
      });
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    logger.info(`Announcement status toggled`, {
      announcementId: id,
      newStatus: announcement.isActive ? 'active' : 'inactive',
      updatedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: `Announcement ${announcement.isActive ? 'activated' : 'deactivated'} successfully`,
      data: announcement
    });

  } catch (error) {
    logger.error('Error in toggleAnnouncementStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle announcement status'
    });
  }
};

// @desc    Get user's unread announcements
// @route   GET /api/announcements/unread
// @access  All authenticated users
export const getUnreadAnnouncements = async (req, res) => {
  try {
    // Build filter for user's accessible announcements
    const userFilter = await buildUserAnnouncementFilter(req.user);
    
    const filter = {
      ...userFilter,
      isActive: true,
      scheduledFor: { $lte: new Date() },
      readBy: { $nin: [req.user._id] },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    };

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .limit(20); // Limit to recent unread announcements

    res.status(200).json({
      success: true,
      data: announcements,
      count: announcements.length
    });

  } catch (error) {
    logger.error('Error in getUnreadAnnouncements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread announcements'
    });
  }
};

// @desc    Mark announcement as read
// @route   PATCH /api/announcements/:id/read
// @access  All authenticated users
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: 'Announcement not found'
      });
    }

    // Check access
    const hasAccess = await checkAnnouncementAccess(announcement, req.user);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (!announcement.readBy.includes(req.user._id)) {
      announcement.readBy.push(req.user._id);
      await announcement.save();
    }

    res.status(200).json({
      success: true,
      message: 'Announcement marked as read'
    });

  } catch (error) {
    logger.error('Error in markAsRead:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark announcement as read'
    });
  }
};

// @desc    Get announcement statistics
// @route   GET /api/announcements/stats
// @access  Admin/HR
export const getAnnouncementStats = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Overall statistics
    const totalAnnouncements = await Announcement.countDocuments();
    const activeAnnouncements = await Announcement.countDocuments({
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    // Recent announcements
    const recentStats = await Announcement.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRecent: { $sum: 1 },
          byType: {
            $push: {
              type: '$type',
              priority: '$priority'
            }
          }
        }
      }
    ]);

    // Type distribution
    const typeStats = await Announcement.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          active: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isActive', true] },
                    {
                      $or: [
                        { $eq: ['$expiresAt', null] },
                        { $gt: ['$expiresAt', new Date()] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Priority distribution
    const priorityStats = await Announcement.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalAnnouncements,
          activeAnnouncements,
          expiredAnnouncements: totalAnnouncements - activeAnnouncements,
          recentCount: recentStats[0]?.totalRecent || 0
        },
        typeDistribution: typeStats,
        priorityDistribution: priorityStats
      }
    });

  } catch (error) {
    logger.error('Error in getAnnouncementStats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcement statistics'
    });
  }
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Admin only
export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: 'Announcement not found'
      });
    }

    await Announcement.findByIdAndDelete(id);

    logger.info(`Announcement deleted successfully`, {
      announcementId: id,
      title: announcement.title,
      deletedBy: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deleteAnnouncement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete announcement'
    });
  }
};

// Helper function to build user-specific announcement filter
const buildUserAnnouncementFilter = async (user) => {
  const filter = {
    $or: [
      { targetAudience: 'all' },
      { targetAudience: user.role }
    ]
  };

  if (user.employee) {
    const employee = await Employee.findById(user.employee);
    if (employee) {
      filter.$or.push(
        { targetDepartments: employee.department },
        { targetEmployees: user.employee }
      );
    }
  }

  return filter;
};

// Helper function to check announcement access
const checkAnnouncementAccess = async (announcement, user) => {
  // Admin and HR can access all announcements
  if (['admin', 'hr'].includes(user.role)) {
    return true;
  }

  // Check target audience
  if (announcement.targetAudience === 'all' || announcement.targetAudience === user.role) {
    return true;
  }

  // Check if user's department is targeted
  if (user.employee) {
    const employee = await Employee.findById(user.employee);
    if (employee) {
      if (announcement.targetDepartments.includes(employee.department)) {
        return true;
      }
      
      // Check if user is specifically targeted
      if (announcement.targetEmployees.includes(user.employee)) {
        return true;
      }
    }
  }

  return false;
};

// Helper function to send announcement notifications
const sendAnnouncementNotifications = async (announcement) => {
  try {
    let recipients = [];

    // Determine recipients based on target audience
    if (announcement.targetAudience === 'all') {
      const allEmployees = await Employee.find({ isActive: true })
        .populate('user', 'email name');
      recipients = allEmployees.filter(emp => emp.user).map(emp => ({
        email: emp.user.email,
        name: emp.user.name
      }));
    } else if (announcement.targetAudience === 'admin') {
      const admins = await Employee.find({ isActive: true })
        .populate('user', 'email name role');
      recipients = admins
        .filter(emp => emp.user && emp.user.role === 'admin')
        .map(emp => ({
          email: emp.user.email,
          name: emp.user.name
        }));
    } else if (announcement.targetAudience === 'hr') {
      const hrEmployees = await Employee.find({ isActive: true })
        .populate('user', 'email name role');
      recipients = hrEmployees
        .filter(emp => emp.user && ['admin', 'hr'].includes(emp.user.role))
        .map(emp => ({
          email: emp.user.email,
          name: emp.user.name
        }));
    }

    // Add department-specific recipients
    if (announcement.targetDepartments?.length > 0) {
      const deptEmployees = await Employee.find({
        department: { $in: announcement.targetDepartments },
        isActive: true
      }).populate('user', 'email name');
      
      const deptRecipients = deptEmployees
        .filter(emp => emp.user)
        .map(emp => ({
          email: emp.user.email,
          name: emp.user.name
        }));
      
      recipients = [...recipients, ...deptRecipients];
    }

    // Add specific employee recipients
    if (announcement.targetEmployees?.length > 0) {
      const specificEmployees = await Employee.find({
        _id: { $in: announcement.targetEmployees },
        isActive: true
      }).populate('user', 'email name');
      
      const specificRecipients = specificEmployees
        .filter(emp => emp.user)
        .map(emp => ({
          email: emp.user.email,
          name: emp.user.name
        }));
      
      recipients = [...recipients, ...specificRecipients];
    }

    // Remove duplicates
    const uniqueRecipients = recipients.filter((recipient, index, self) =>
      index === self.findIndex(r => r.email === recipient.email)
    );

    // Send emails
    const emailPromises = uniqueRecipients.map(recipient =>
      sendEmail(
        recipient.email,
        `New Announcement: ${announcement.title}`,
        'announcement',
        {
          recipientName: recipient.name,
          announcementTitle: announcement.title,
          announcementContent: announcement.content,
          announcementType: announcement.type,
          priority: announcement.priority,
          createdBy: announcement.createdBy.name
        }
      )
    );

    await Promise.allSettled(emailPromises);
    
    logger.info(`Announcement notifications sent`, {
      announcementId: announcement._id,
      recipientCount: uniqueRecipients.length
    });

  } catch (error) {
    logger.error('Error sending announcement notifications:', error);
    throw error;
  }
};