const express = require('express');
const { authRequired } = require('../middleware/auth');
const { query, queryOne } = require('../utils/db');
const { formatDateForMySQL, parseJSON } = require('../utils/helpers');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Setup avatar upload directory
const isProd = process.env.NODE_ENV === 'production';
const avatarUploadDir = isProd
  ? path.join(__dirname, '../../avatars')
  : path.join(__dirname, '../public/avatars');

if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    // Use userId for avatar filename to easily identify and replace
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// GET /profile - Get user profile data
router.get('/', authRequired, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, email, name, avatarUrl, createdAt, lastLoginAt, lastActivityAt, passwordChangedAt FROM User WHERE id = ?',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

// PUT /profile/username - Update username
router.put('/username', authRequired, async (req, res) => {
  try {
    const { name } = req.body || {};
    
    // Validation
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required' });
    }
    
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({ message: 'Name must be between 2 and 50 characters' });
    }
    
    // Update
    const now = formatDateForMySQL();
    await query(
      'UPDATE User SET name = ?, updatedAt = ? WHERE id = ?',
      [trimmedName, now, req.user.id]
    );
    
    res.json({ success: true, name: trimmedName });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ message: 'Failed to update username' });
  }
});

// PUT /profile/email - Update email (requires password verification)
router.put('/email', authRequired, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Verify current password
    const user = await queryOne(
      'SELECT passwordHash FROM User WHERE id = ?',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Check if email already exists
    const existing = await queryOne(
      'SELECT id FROM User WHERE email = ? AND id != ?',
      [trimmedEmail, req.user.id]
    );
    
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    
    // Update
    const now = formatDateForMySQL();
    await query(
      'UPDATE User SET email = ?, updatedAt = ? WHERE id = ?',
      [trimmedEmail, now, req.user.id]
    );
    
    res.json({ success: true, email: trimmedEmail });
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({ message: 'Failed to update email' });
  }
});

// PUT /profile/password - Change password
router.put('/password', authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    
    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    // Verify current password
    const user = await queryOne(
      'SELECT passwordHash FROM User WHERE id = ?',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);
    
    // Update
    const now = formatDateForMySQL();
    await query(
      'UPDATE User SET passwordHash = ?, updatedAt = ?, passwordChangedAt = ? WHERE id = ?',
      [newPasswordHash, now, now, req.user.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// GET /profile/stats - Get user statistics
router.get('/stats', authRequired, async (req, res) => {
  try {
    // Get classes owned count
    const classesResult = await queryOne(
      'SELECT COUNT(*) as count FROM Class WHERE ownerId = ?',
      [req.user.id]
    );
    const classesOwned = classesResult?.count || 0;
    
    // Get quizzes owned count
    const quizzesOwnedResult = await queryOne(
      'SELECT COUNT(*) as count FROM Quiz WHERE ownerId = ?',
      [req.user.id]
    );
    const quizzesOwned = quizzesOwnedResult?.count || 0;
    
    // Get quizzes taken count (total number of quiz attempts/sessions)
    const quizzesTakenResult = await queryOne(
      'SELECT COUNT(*) as count FROM QuizSession WHERE userId = ?',
      [req.user.id]
    );
    const quizzesTaken = quizzesTakenResult?.count || 0;
    
    // Get total sessions count
    const totalSessionsResult = await queryOne(
      'SELECT COUNT(*) as count FROM QuizSession WHERE userId = ?',
      [req.user.id]
    );
    const totalSessions = totalSessionsResult?.count || 0;
    
    // Get average score
    const avgScoreResult = await queryOne(
      `SELECT 
        AVG(CASE WHEN totalQuestions > 0 THEN (score * 100.0 / totalQuestions) ELSE 0 END) as avgScore
       FROM QuizSession 
       WHERE userId = ?`,
      [req.user.id]
    );
    const averageScore = avgScoreResult?.avgScore ? Math.round(avgScoreResult.avgScore) : 0;
    
    // Get recent sessions (all sessions, ordered by most recent)
    const recentSessions = await query(
      `SELECT 
        s.id, s.quizId, s.score, s.totalQuestions, s.timeSpent, s.completedAt,
        q.title as quizTitle,
        c.name as className
       FROM QuizSession s
       JOIN Quiz q ON s.quizId = q.id
       JOIN Class c ON q.classId = c.id
       WHERE s.userId = ?
       ORDER BY s.completedAt DESC`,
      [req.user.id]
    );
    
    // Parse JSON fields and calculate percentages
    for (const session of recentSessions) {
      session.percentage = session.totalQuestions > 0 
        ? Math.round((session.score / session.totalQuestions) * 100)
        : 0;
    }
    
    res.json({
      classesOwned,
      quizzesOwned,
      quizzesTaken,
      totalSessions,
      averageScore,
      recentSessions
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to get statistics' });
  }
});

// GET /profile/activity - Get quiz activity data for contribution graph
router.get('/activity', authRequired, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    
    // Validate year
    const currentYear = new Date().getFullYear();
    if (year < 2025 || year > currentYear) {
      return res.status(400).json({ message: 'Invalid year' });
    }
    
    // Get quiz completion activity for the specified year
    const activityData = await query(
      `SELECT 
        DATE(completedAt) as date,
        COUNT(*) as count
       FROM QuizSession
       WHERE userId = ? 
         AND YEAR(completedAt) = ?
       GROUP BY DATE(completedAt)
       ORDER BY date ASC`,
      [req.user.id, year]
    );
    
    // Create a map of existing data
    const dataMap = new Map();
    activityData.forEach(item => {
      const dateStr = item.date.toISOString().split('T')[0];
      dataMap.set(dateStr, item.count || 0);
    });
    
    // Fill in all dates for the year
    const startDate = new Date(year, 0, 1); // January 1
    const endDate = new Date(year, 11, 31); // December 31 - always show full year
    const formattedData = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const count = dataMap.get(dateStr) || 0;
      
      // Calculate level based on count
      let level = 0;
      if (count > 0) level = 1;
      if (count >= 3) level = 2;
      if (count >= 5) level = 3;
      if (count >= 8) level = 4;
      
      formattedData.push({
        date: dateStr,
        count: count,
        level: level
      });
    }
    
    res.json(formattedData);
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ message: 'Failed to get activity data' });
  }
});

// POST /profile/avatar - Upload and update avatar
router.post('/avatar', authRequired, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Get current user to check for existing avatar
    const user = await queryOne(
      'SELECT avatarUrl FROM User WHERE id = ?',
      [req.user.id]
    );

    // Delete old avatar file if exists
    if (user && user.avatarUrl) {
      const oldFilename = path.basename(user.avatarUrl);
      const oldFilePath = path.join(avatarUploadDir, oldFilename);
      if (fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
          console.log(`Deleted old avatar: ${oldFilename}`);
        } catch (err) {
          console.error('Error deleting old avatar:', err);
        }
      }
    }

    // Create URL for the new avatar
    const protocol = req.protocol;
    const host = req.get('host');
    const BASE_PATH = process.env.PASSENGER_BASE_URI || process.env.BASE_PATH || (isProd ? '/api' : '');
    const avatarUrl = `${protocol}://${host}${BASE_PATH}/avatars/${req.file.filename}`;

    // Update database with new avatar URL
    const now = formatDateForMySQL();
    await query(
      'UPDATE User SET avatarUrl = ?, updatedAt = ? WHERE id = ?',
      [avatarUrl, now, req.user.id]
    );

    res.json({
      success: true,
      avatarUrl: avatarUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    // Delete uploaded file if database update failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
});

// DELETE /profile/avatar - Remove avatar
router.delete('/avatar', authRequired, async (req, res) => {
  try {
    // Get current user's avatar
    const user = await queryOne(
      'SELECT avatarUrl FROM User WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete avatar file if exists
    if (user.avatarUrl) {
      const filename = path.basename(user.avatarUrl);
      const filePath = path.join(avatarUploadDir, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted avatar: ${filename}`);
        } catch (err) {
          console.error('Error deleting avatar file:', err);
        }
      }
    }

    // Update database to remove avatar URL
    const now = formatDateForMySQL();
    await query(
      'UPDATE User SET avatarUrl = NULL, updatedAt = ? WHERE id = ?',
      [now, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({ message: 'Failed to delete avatar' });
  }
});

module.exports = router;
