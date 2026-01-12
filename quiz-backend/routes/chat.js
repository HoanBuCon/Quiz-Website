const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired } = require('../middleware/auth');
const { query, queryOne } = require('../utils/db');
const { generateCuid, formatDateForMySQL } = require('../utils/helpers');

// Cache số người online
let onlineCountCache = { count: 0, timestamp: 0, windowMinutes: 5 };
const CACHE_DURATION_MS = 10000; // 10 giây

const isProd = process.env.NODE_ENV === 'production';
const baseChatUploadDir = isProd
  ? path.join(__dirname, '../../chatbox/uploads')
  : path.join(__dirname, '../public/chatbox/uploads');

// Ensure base dirs exist
for (const sub of ['', '/images', '/videos', '/files']) {
  const dir = path.join(baseChatUploadDir, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let sub = 'files';
    if (file.mimetype.startsWith('image/')) sub = 'images';
    else if (file.mimetype.startsWith('video/')) sub = 'videos';
    cb(null, path.join(baseChatUploadDir, sub));
  },
  filename: (_req, file, cb) => {
    // Fix UTF-8 encoding
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    
    // Keep original characters, just replace potentially problematic chars
    const nameWithoutExt = path
      .basename(originalName, ext)
      .replace(/[<>:"/\\|?*]/g, '-') // Replace file system reserved chars
      .substring(0, 100); // Allow longer names
      
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      [
        'application/pdf',
        'application/zip',
        'application/x-zip-compressed',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'application/json',
      ].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Loại tệp không được hỗ trợ'), false);
  },
});

// Helper function để kiểm tra Date hợp lệ
function isValidDate(d) {
  return d instanceof Date && !isNaN(d);
}

// Online count
router.get('/online-count', authRequired, async (req, res) => {
  try {
    const now = Date.now();
    if (now - onlineCountCache.timestamp < CACHE_DURATION_MS) {
      return res.json(onlineCountCache);
    }

    const minutes = Number(process.env.ONLINE_WINDOW_MINUTES || 5);
    const since = formatDateForMySQL(new Date(now - minutes * 60 * 1000));
    
    const result = await queryOne(
      'SELECT COUNT(*) as count FROM User WHERE lastActivityAt > ?',
      [since]
    );
    
    const count = result ? result.count : 0;
    onlineCountCache = { count, timestamp: now, windowMinutes: minutes };
    res.json(onlineCountCache);
  } catch (e) {
    console.error("Online count error:", e);
    // Trả về cache cũ nếu lỗi DB để tránh sập UI
    res.json(onlineCountCache); 
  }
});

function buildPublicUrl(filename, mimetype) {
  const sub = mimetype.startsWith('image/')
    ? 'images'
    : mimetype.startsWith('video/')
    ? 'videos'
    : 'files';
  return `/chatbox/uploads/${sub}/${filename}`;
}

// Unread count
router.get('/unread-count', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const readStatus = await queryOne(
      'SELECT lastReadAt FROM ChatReadStatus WHERE userId = ?',
      [userId]
    );
    
    const lastReadAt = readStatus?.lastReadAt || formatDateForMySQL(new Date(0));
    
    const result = await queryOne(
      'SELECT COUNT(*) as count FROM ChatMessage WHERE createdAt > ? AND userId != ?',
      [lastReadAt, userId]
    );
    
    const count = result ? result.count : 0;
    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Mark read
router.post('/mark-read', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = formatDateForMySQL();
    
    // Upsert ChatReadStatus
    const existing = await queryOne(
      'SELECT id FROM ChatReadStatus WHERE userId = ?',
      [userId]
    );
    
    if (existing) {
      await query(
        'UPDATE ChatReadStatus SET lastReadAt = ?, updatedAt = ? WHERE userId = ?',
        [now, now, userId]
      );
    } else {
      const id = generateCuid();
      await query(
        'INSERT INTO ChatReadStatus (id, userId, lastReadAt, updatedAt) VALUES (?, ?, ?, ?)',
        [id, userId, now, now]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Get messages
router.get('/messages', authRequired, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    
    // Parse date an toàn
    let before = req.query.before ? new Date(req.query.before) : null;
    let after = req.query.after ? new Date(req.query.after) : null;
    
    // Nếu date không hợp lệ (do sai lệch múi giờ client gửi lên chuỗi lạ), gán về null
    if (before && !isValidDate(before)) before = null;
    if (after && !isValidDate(after)) after = null;
    
    let whereClause = '';
    let params = [];
    
    if (before) {
      whereClause = 'WHERE cm.createdAt < ?';
      params.push(formatDateForMySQL(before));
    } else if (after) {
      whereClause = 'WHERE cm.createdAt > ?';
      params.push(formatDateForMySQL(after));
    }

    const messages = await query(`
      SELECT 
        cm.id, cm.userId, cm.content, cm.attachmentUrl, cm.attachmentType, cm.createdAt,
        u.id as user_id, u.name as user_name, u.email as user_email, u.avatarUrl as user_avatar
      FROM ChatMessage cm
      JOIN User u ON cm.userId = u.id
      ${whereClause}
      ORDER BY cm.createdAt DESC
      LIMIT ?
    `, [...params, limit]);
    
    // Transform to match Prisma format
    const formatted = messages.map(m => ({
      id: m.id,
      userId: m.userId,
      content: m.content,
      attachmentUrl: m.attachmentUrl,
      attachmentType: m.attachmentType,
      createdAt: m.createdAt,
      user: {
        id: m.user_id,
        name: m.user_name,
        email: m.user_email,
        avatarUrl: m.user_avatar
      }
    }));
    
    res.json(formatted.reverse());
  } catch (e) {
    console.error("Get messages error:", e);
    // Quan trọng: Trả về lỗi 500 thay vì để nodejs crash
    res.status(500).json({ message: "Lỗi tải tin nhắn" });
  }
});

// Post message
router.post(
  '/messages',
  authRequired,
  upload.single('attachment'),
  async (req, res) => {
    try {
      const { content } = req.body || {};
      if (!content && !req.file) {
        return res.status(400).json({ message: 'Nội dung trống' });
      }

      let attachmentUrl = null;
      let attachmentType = null;

      if (req.file) {
        attachmentUrl = buildPublicUrl(req.file.filename, req.file.mimetype);
        if (req.file.mimetype.startsWith('image/')) attachmentType = 'image';
        else if (req.file.mimetype.startsWith('video/')) attachmentType = 'video';
        else attachmentType = 'file';
      }

      const messageId = generateCuid();
      const now = formatDateForMySQL();
      
      await query(
        'INSERT INTO ChatMessage (id, userId, content, attachmentUrl, attachmentType, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [messageId, req.user.id, content || null, attachmentUrl, attachmentType, now]
      );
      
      // Fetch created message with user info
      const created = await queryOne(`
        SELECT 
          cm.id, cm.userId, cm.content, cm.attachmentUrl, cm.attachmentType, cm.createdAt,
          u.id as user_id, u.name as user_name, u.email as user_email, u.avatarUrl as user_avatar
        FROM ChatMessage cm
        JOIN User u ON cm.userId = u.id
        WHERE cm.id = ?
      `, [messageId]);
      
      const formatted = {
        id: created.id,
        userId: created.userId,
        content: created.content,
        attachmentUrl: created.attachmentUrl,
        attachmentType: created.attachmentType,
        createdAt: created.createdAt,
        user: {
          id: created.user_id,
          name: created.user_name,
          email: created.user_email,
          avatarUrl: created.user_avatar
        }
      };

      res.status(201).json(formatted);
    } catch (e) {
      console.error("Post message error:", e);
      res.status(500).json({ message: "Lỗi lưu tin nhắn" });
    }
  }
);

// Delete message
router.delete('/messages/:id', authRequired, async (req, res) => {
  try {
    const id = req.params.id;
    const msg = await queryOne('SELECT id, userId, attachmentUrl FROM ChatMessage WHERE id = ?', [id]);
    
    if (!msg) return res.status(404).json({ message: 'Không tìm thấy' });
    if (msg.userId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    if (msg.attachmentUrl && msg.attachmentUrl.includes('/chatbox/uploads/')) {
      try {
        const rel = msg.attachmentUrl.split('/chatbox/uploads/').pop();
        const filePath = path.join(baseChatUploadDir, rel);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete chat attachment:', e);
      }
    }

    await query('DELETE FROM ChatMessage WHERE id = ?', [id]);
    res.status(204).end();
  } catch (e) {
    console.error("Delete message error:", e);
    res.status(500).json({ message: "Lỗi xóa tin nhắn" });
  }
});

module.exports = router;