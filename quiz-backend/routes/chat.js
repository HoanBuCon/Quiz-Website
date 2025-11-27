const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired } = require('../middleware/auth');

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

    const prisma = req.prisma;
    const minutes = Number(process.env.ONLINE_WINDOW_MINUTES || 5);
    const since = new Date(now - minutes * 60 * 1000);
    
    const count = await prisma.user.count({
      where: { lastActivityAt: { gt: since } },
    });
    
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
    const prisma = req.prisma;
    const userId = req.user.id;
    
    const readStatus = await prisma.chatReadStatus.findUnique({
      where: { userId },
    });
    
    const lastReadAt = readStatus?.lastReadAt || new Date(0);
    
    const count = await prisma.chatMessage.count({
      where: {
        createdAt: { gt: lastReadAt },
        userId: { not: userId },
      },
    });
    
    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Mark read
router.post('/mark-read', authRequired, async (req, res) => {
  try {
    const prisma = req.prisma;
    const userId = req.user.id;
    
    await prisma.chatReadStatus.upsert({
      where: { userId },
      create: { userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// --- FIX QUAN TRỌNG: Thêm Try/Catch và Validate Date ---
router.get('/messages', authRequired, async (req, res) => {
  try {
    const prisma = req.prisma;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    
    // Parse date an toàn
    let before = req.query.before ? new Date(req.query.before) : null;
    let after = req.query.after ? new Date(req.query.after) : null;
    
    // Nếu date không hợp lệ (do sai lệch múi giờ client gửi lên chuỗi lạ), gán về null
    if (before && !isValidDate(before)) before = null;
    if (after && !isValidDate(after)) after = null;
    
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
    
    res.json(messages.reverse());
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

      const created = await prisma.chatMessage.create({
        data: {
          userId: req.user.id,
          content: content || null,
          attachmentUrl,
          attachmentType,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      res.status(201).json(created);
    } catch (e) {
      console.error("Post message error:", e);
      res.status(500).json({ message: "Lỗi lưu tin nhắn" });
    }
  }
);

// Delete message
router.delete('/messages/:id', authRequired, async (req, res) => {
  try {
    const prisma = req.prisma;
    const id = req.params.id;
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    
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

    await prisma.chatMessage.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    console.error("Delete message error:", e);
    res.status(500).json({ message: "Lỗi xóa tin nhắn" });
  }
});

module.exports = router;