// ====== Load environment first ======
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const db = require('./utils/db');

// ====== Detect Passenger environment ======
// Giữ lại để có thể dùng biến này ở nơi khác nếu cần
const runningUnderPassenger =
  !!process.env.PASSENGER_APP_ENV || !!process.env.PASSENGER_BASE_URI;

// ====== THAY ĐỔI 1: Xóa bỏ toàn bộ cơ chế Lock File ======
// Logic lock file (acquireLock, releaseLock) đã bị xóa bỏ hoàn toàn.
// Nó không cần thiết và gây ra lỗi khi chạy trên Passenger,
// vốn đã là một trình quản lý tiến trình.
console.log('[INFO] Running process PID:', process.pid);

// ====== Check production requirements ======
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required in production');
  process.exit(1); // Lỗi này là lỗi cấu hình, cho phép exit
}

// ====== Base path setup (GIỮ NGUYÊN) ======
const BASE_PATH =
  process.env.PASSENGER_BASE_URI ||
  process.env.BASE_PATH ||
  (isProd ? '/api' : '');
console.log('Base path (for cPanel mapping):', BASE_PATH || '(root)');

// ====== Database Connection (MySQL) ======
// Test connection on startup (không block)
db.testConnection();
console.log('[INIT] MySQL connection pool initialized');
// ===================================================

// ====== Express app setup (GIỮ NGUYÊN) ======
const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const devDefaults = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://liemdai.io.vn',
  'https://www.liemdai.io.vn',
];

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : devDefaults,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(
  morgan((tokens, req, res) => {
    const url = (req.originalUrl || '').replace(
      /token=[^&]+/,
      'token=[REDACTED]'
    );
    return `${tokens.method(req, res)} ${url} ${tokens.status(
      req,
      res
    )} ${tokens['response-time'](req, res)} ms`;
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ====== Static file serving ======
const uploadPath = isProd
  ? path.join(__dirname, '../uploads')
  : path.join(__dirname, 'public/uploads');

const chatUploadPath = isProd
  ? path.join(__dirname, '../chatbox/uploads')
  : path.join(__dirname, 'public/chatbox/uploads');

// Bọc trong try...catch để tránh crash-loop khi khởi động
try {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  if (!fs.existsSync(chatUploadPath)) {
    fs.mkdirSync(chatUploadPath, { recursive: true });
  }
  console.log('[INFO] Upload directories ensured');
} catch (e) {
  console.error(
    `[FATAL STARTUP ERROR] Không thể tạo thư mục /uploads hoặc /chatbox/uploads.`
  );
  console.error('Vui lòng tạo các thư mục này bằng tay qua CPanel File Manager.');
  console.error(e);
}

// ====== Database Middleware ======
// Attach db utilities to req for easy access
app.use((req, _res, next) => {
  req.db = db;
  next();
});
// =================================================

app.use(
  `${BASE_PATH}/uploads`,
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadPath)
);

app.use(
  `${BASE_PATH}/chatbox/uploads`,
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(chatUploadPath)
);
// =======================================================

// ====== Health Check (GIỮ NGUYÊN) ======
app.get(`${BASE_PATH}/health`, (_req, res) => {
  try {
    res.json({
      status: 'ok',
      basePath: BASE_PATH || '',
      env: process.env.NODE_ENV,
      pid: process.pid,
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
// ===========================================

// ====== Load routers (GIỮ NGUYÊN) ======
const authRouter = require('./routes/auth');
const classesRouter = require('./routes/classes');
const quizzesRouter = require('./routes/quizzes');
const sessionsRouter = require('./routes/sessions');
const filesRouter = require('./routes/files');
const visibilityRouter = require('./routes/visibility');
const imagesRouter = require('./routes/images');
const chatRouter = require('./routes/chat');
const profileRouter = require('./routes/profile');

// ====== Mount routers (GIỮ NGUYÊN) ======
console.log(`Mounting routers at: ${BASE_PATH || '(root)'}`);
app.use(`${BASE_PATH}/auth`, authRouter);
app.use(`${BASE_PATH}/classes`, classesRouter);
app.use(`${BASE_PATH}/quizzes`, quizzesRouter);
app.use(`${BASE_PATH}/sessions`, sessionsRouter);
app.use(`${BASE_PATH}/files`, filesRouter);
app.use(`${BASE_PATH}/visibility`, visibilityRouter);
app.use(`${BASE_PATH}/images`, imagesRouter);
app.use(`${BASE_PATH}/chat`, chatRouter);
app.use(`${BASE_PATH}/profile`, profileRouter);

// ====== 404 handler (GIỮ NGUYÊN) ======
app.use((req, res) => {
  res.status(404).json({
    message: 'Not Found',
    path: req.path,
    method: req.method,
    availablePaths: [
      `${BASE_PATH}/health`,
      `${BASE_PATH}/auth/*`,
      `${BASE_PATH}/classes/*`,
      `${BASE_PATH}/quizzes/*`,
      `${BASE_PATH}/sessions/*`,
      `${BASE_PATH}/files/*`,
      `${BASE_PATH}/visibility/*`,
      `${BASE_PATH}/images/*`,
      `${BASE_PATH}/chat/*`,
      `${BASE_PATH}/uploads/*`,
      `${BASE_PATH}/chatbox/uploads/*`,
    ],
  });
});

// ====== Global error handler (GIỮ NGUYÊN) ======
app.use((err, req, res, _next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ====== Start server ======
const port = Number(process.env.PORT || 4000);
let server;
try {
  server = app.listen(port, () => {
    console.log(`Quiz API running on port ${port}`);
    console.log(`Health check: http://localhost:${port}${BASE_PATH}/health`);
  });
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
    console.error(`Try: killall node (or taskkill /F /IM node.exe on Windows)`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    throw err;
  }
});

// ====== Graceful shutdown ======
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  server.close(() => {
    console.log('HTTP server closed');
  });
  try {
    await db.close();
    console.log('Database disconnected');
  } catch (err) {
    console.error('Error disconnecting database:', err);
  }
  console.log('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV === 'development') {
  process.on('SIGUSR2', () => {
    console.log('Nodemon restart detected...');
    process.kill(process.pid, 'SIGTERM');
  });
}