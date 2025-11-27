const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired } = require('../middleware/auth');
// const jwt = require('jsonwebtoken'); // Không cần dùng cho Polling

// Cache số người online để tránh query DB liên tục
let onlineCountCache = { count: 0, timestamp: 0, windowMinutes: 5 };
const CACHE_DURATION_MS = 10000; // 10 giây

const isProd = process.env.NODE_ENV === 'production';
// Local dev: quiz-backend/public/chatbox/uploads
// Production (cPanel): public_html/chatbox/uploads (resolve relative to app dir)
const baseChatUploadDir = isProd
  ? path.join(__dirname, '../../chatbox/uploads')
  : path.join(__dirname, '../public/chatbox/uploads');

// Ensure base dirs exist
for (const sub of ['', '/images', '/videos', '/files']) {
  const dir = path.join(baseChatUploadDir, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Multer storage config: decide subfolder by mimetype
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let sub = 'files';
    if (file.mimetype.startsWith('image/')) sub = 'images';
    else if (file.mimetype.startsWith('video/')) sub = 'videos';
    cb(null, path.join(baseChatUploadDir, sub));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path
      .basename(file.originalname, ext)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    // Allow images, videos, and common docs
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

// Online count (users active within last N minutes)
router.get('/online-count', authRequired, async (req, res) => {
  // 1. Kiểm tra cache trước
  const now = Date.now();
  if (now - onlineCountCache.timestamp < CACHE_DURATION_MS) {
    return res.json(onlineCountCache);
  }

  // 2. Nếu cache cũ, truy vấn DB
  const prisma = req.prisma;
  const minutes = Number(process.env.ONLINE_WINDOW_MINUTES || 5);
  const since = new Date(now - minutes * 60 * 1000);
  try {
    const count = await prisma.user.count({
      where: { lastActivityAt: { gt: since } },
    });
    
    // 3. Cập nhật cache và trả về
    onlineCountCache = { count, timestamp: now, windowMinutes: minutes };
    res.json(onlineCountCache);
  } catch (e) {
    res.status(500).json({ message: 'Lỗi khi lấy số người online' });
  }
});

// Build public URL for saved file relative to root
function buildPublicUrl(filename, mimetype) {
  const sub = mimetype.startsWith('image/')
    ? 'images'
    : mimetype.startsWith('video/')
    ? 'videos'
    : 'files';
  return `/chatbox/uploads/${sub}/${filename}`;
}

// Get unread count for current user
router.get('/unread-count', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const userId = req.user.id;
  
  try {
    const readStatus = await prisma.chatReadStatus.findUnique({
      where: { userId },
    });
    
    const lastReadAt = readStatus?.lastReadAt || new Date(0);
    
    const count = await prisma.chatMessage.count({
      where: {
        createdAt: { gt: lastReadAt },
        userId: { not: userId }, // Exclude own messages
      },
    });
    
    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Lỗi khi lấy số tin nhắn chưa đọc' });
  }
});

// Mark messages as read
router.post('/mark-read', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const userId = req.user.id;
  
  try {
    await prisma.chatReadStatus.upsert({
      where: { userId },
      create: {
        userId,
        lastReadAt: new Date(),
      },
      update: {
        lastReadAt: new Date(),
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ message: 'Lỗi khi đánh dấu đã đọc' });
  }
});

// List recent messages (Polling endpoint)
router.get('/messages', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const before = req.query.before ? new Date(req.query.before) : null;
  const after = req.query.after ? new Date(req.query.after) : null;
  
  let where = {};
  if (before) {
    where = { createdAt: { lt: before } };
  } else if (after) {
    where = { createdAt: { gt: after } };
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  // Trả về thứ tự cũ nhất -> mới nhất để UI render đúng
  res.json(messages.reverse());
});

// Post a message (text + optional attachment)
router.post(
  '/messages',
  authRequired,
  upload.single('attachment'),
  async (req, res) => {
    const prisma = req.prisma;
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

    try {
      const created = await prisma.chatMessage.create({
        data: {
          userId: req.user.id,
          content: content || null,
          attachmentUrl,
          attachmentType,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      // Với Shared Hosting, ta KHÔNG dùng broadcast SSE. 
      // Client sẽ tự động Polling và thấy tin nhắn mới sau vài giây.

      res.status(201).json(created);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Lỗi lưu tin nhắn" });
    }
  }
);

// Delete a message
router.delete('/messages/:id', authRequired, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;
  try {
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg) return res.status(404).json({ message: 'Không tìm thấy' });
    if (msg.userId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    // Try delete file if exists
    if (msg.attachmentUrl && msg.attachmentUrl.includes('/chatbox/uploads/')) {
      try {
        const rel = msg.attachmentUrl.split('/chatbox/uploads/').pop();
        const filePath = path.join(baseChatUploadDir, rel);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete chat attachment:', e);
      }
    }

    await prisma.chatMessage.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: "Lỗi xóa tin nhắn" });
  }
});

module.exports = router;