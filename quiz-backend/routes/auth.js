console.log("Auth router loaded");
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { authRequired } = require('../middleware/auth');
const { query, queryOne, transaction } = require('../utils/db');
const { generateCuid, formatDateForMySQL } = require('../utils/helpers');
const router = express.Router();

// Get current user info (consistent response shape)
router.get('/me', authRequired, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, email, name, avatarUrl, lastLoginAt, createdAt, passwordChangedAt FROM User WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const normalizedEmail = email.toLowerCase().trim();
  
  const existing = await queryOne('SELECT id FROM User WHERE email = ?', [normalizedEmail]);
  if (existing) return res.status(409).json({ message: 'Email already registered' });
  
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = generateCuid();
  const now = formatDateForMySQL();
  
  await query(
    'INSERT INTO User (id, email, passwordHash, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, normalizedEmail, passwordHash, name || null, now, now]
  );
  
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'devsecret' : null);
  if (!secret) return res.status(500).json({ message: 'Server misconfigured' });
  const token = jwt.sign({ sub: userId, email: normalizedEmail }, secret, { expiresIn: '30d' });
  
  // Set httpOnly cookie for enhanced security
  // Default to session cookie (expires when browser closes) for signup
  const signupCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // lax works for same-site (production on same domain)
    path: '/'
    // No maxAge = session cookie (expires when browser closes)
  };
  
  // Add domain for production if specified
  if (process.env.COOKIE_DOMAIN) {
    signupCookieOptions.domain = process.env.COOKIE_DOMAIN;
  }
  
  res.cookie('auth_token', token, signupCookieOptions);
  
  // Still return token for backward compatibility during migration
  res.status(201).json({ token, user: { id: userId, email: normalizedEmail, name: name || null, createdAt: now, lastLoginAt: null, passwordChangedAt: now } });
});

router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const normalizedEmail = email.toLowerCase().trim();
  
  const user = await queryOne('SELECT id, email, name, avatarUrl, passwordHash FROM User WHERE email = ?', [normalizedEmail]);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'devsecret' : null);
  if (!secret) return res.status(500).json({ message: 'Server misconfigured' });
  const token = jwt.sign({ sub: user.id, email: user.email }, secret, { expiresIn: '30d' });
  
  // update lastLoginAt + lastActivityAt
  const now = formatDateForMySQL();
  try {
    await query(
      'UPDATE User SET lastLoginAt = ?, lastActivityAt = ?, updatedAt = ? WHERE id = ?',
      [now, now, now, user.id]
    );
  } catch (_) {}
  
  // Set httpOnly cookie for enhanced security
  // If rememberMe is true, cookie lasts 30 days; otherwise it's a session cookie
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // lax works for same-site (production on same domain)
    path: '/'
  };
  
  // Add domain for production if specified
  if (process.env.COOKIE_DOMAIN) {
    cookieOptions.domain = process.env.COOKIE_DOMAIN;
  }
  
  // Set maxAge only if rememberMe is true
  if (rememberMe) {
    cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }
  
  res.cookie('auth_token', token, cookieOptions);
  
  // Still return token for backward compatibility during migration
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, lastLoginAt: now } });
});

// Logout
router.post('/logout', authRequired, async (req, res) => {
  try {
    // Đặt lastActivityAt về 6 phút trước để
    // user rớt khỏi danh sách online ngay lập tức.
    const sixMinutesAgo = formatDateForMySQL(new Date(Date.now() - 6 * 60 * 1000));
    const now = formatDateForMySQL();
    
    await query(
      'UPDATE User SET lastLogoutAt = ?, lastActivityAt = ?, updatedAt = ? WHERE id = ?',
      [now, sixMinutesAgo, now, req.user.id]
    );
    
    // Clear the auth cookie
    const clearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    };
    
    if (process.env.COOKIE_DOMAIN) {
      clearOptions.domain = process.env.COOKIE_DOMAIN;
    }
    
    res.clearCookie('auth_token', clearOptions);
    
    res.status(204).end();
  } catch (_e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Endpoint này được gọi bằng sendBeacon từ frontend khi tab trình duyệt đóng
router.post('/offline-signal', async (req, res) => {
  // Try to get token from cookie first, then fallback to query param (sendBeacon limitation)
  const token = req.cookies?.auth_token || req.query.token;
  
  if (!token) {
    return res.status(401).end();
  }

  let userId;
  try {
    // Tự xác thực token
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'devsecret' : null);
    if (!secret) return res.status(500).end();
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    userId = payload.sub;
    if (!userId) return res.status(401).end();
    
  } catch (e) {
    return res.status(401).end(); // Token hỏng hoặc hết hạn
  }

  // Nếu token hợp lệ, thực hiện logic tương tự như logout
  try {
    const sixMinutesAgo = formatDateForMySQL(new Date(Date.now() - 6 * 60 * 1000));
    const now = formatDateForMySQL();
    
    await query(
      'UPDATE User SET lastActivityAt = ?, updatedAt = ? WHERE id = ?',
      [sixMinutesAgo, now, userId]
    );
    
    res.status(204).end();
  } catch (_e) {
    res.status(500).end();
  }
});

// Forgot password: return resetToken/resetLink (demo; normally email this)
router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const normalizedEmail = email.toLowerCase().trim();
  const user = await queryOne('SELECT id, email FROM User WHERE email = ?', [normalizedEmail]);
  // Do not reveal whether user exists
  if (!user) return res.status(204).end();

  // In production, NEVER return reset tokens over the API
  if (process.env.NODE_ENV === 'production') {
    return res.status(204).end();
  }
  // Development-only helper: return token to ease local testing
  const secret = process.env.JWT_SECRET || 'devsecret';
  const resetToken = jwt.sign({ sub: user.id, email: user.email, type: 'reset' }, secret, { expiresIn: '15m' });
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  res.json({ resetToken, resetLink });
});

// Reset password using reset token
router.post('/reset', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ message: 'Invalid payload' });
  try {
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'devsecret' : null);
    if (!secret) return res.status(500).json({ message: 'Server misconfigured' });
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (payload.type !== 'reset') return res.status(400).json({ message: 'Invalid token type' });
    const userId = payload.sub;
    const hash = await bcrypt.hash(newPassword, 10);
    const now = formatDateForMySQL();
    await query('UPDATE User SET passwordHash = ?, updatedAt = ?, passwordChangedAt = ? WHERE id = ?', [hash, now, now, userId]);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ message: 'Invalid or expired token' });
  }
});

// ====== OTP-based Forgot/Reset Password ======
function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP not configured');
  const tls = { rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true') !== 'false' };
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass }, tls });
}

function genOtp() { return (Math.floor(100000 + Math.random() * 900000)).toString(); }

router.post('/forgot-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const normalizedEmail = email.toLowerCase().trim();
  const user = await queryOne('SELECT id, email FROM User WHERE email = ?', [normalizedEmail]);
  if (!user) return res.status(404).json({ message: 'Email không tồn tại' });

  const throttleSec = Number(process.env.OTP_THROTTLE_SECONDS || 60);
  const ttlSec = Number(process.env.OTP_TTL_SECONDS || 600);

  // throttle: if a recent request within throttleSec exists, deny
  const now = formatDateForMySQL();
  const recent = await queryOne(
    'SELECT id, createdAt FROM PasswordReset WHERE email = ? AND usedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC LIMIT 1',
    [normalizedEmail, now]
  );
  if (recent) {
    const diff = Date.now() - new Date(recent.createdAt).getTime();
    if (diff < throttleSec * 1000) return res.status(429).json({ message: 'Vui lòng thử lại sau ít phút' });
  }

  const otp = genOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = formatDateForMySQL(new Date(Date.now() + ttlSec * 1000));

  try {
    const transporter = buildTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; }
    .content { padding: 40px 32px; color: #334155; line-height: 1.6; }
    .otp-box { background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 8px; padding: 24px; text-align: center; margin: 32px 0; }
    .otp-code { font-family: monospace; font-size: 36px; font-weight: 800; color: #ea580c; letter-spacing: 6px; }
    .footer { background-color: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Mã Xác Nhận OTP</h1>
    </div>
    <div class="content">
      <p style="margin-top: 0">Xin chào,</p>
      <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Đây là mã xác thực <b>(OTP)</b> của bạn:</p>
      
      <div class="otp-box">
        <span class="otp-code">${otp}</span>
      </div>
      
      <p style="text-align: center; color: #64748b; font-size: 14px;">Mã này sẽ hết hạn sau <b>${Math.round(ttlSec/60)} phút</b>.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;">
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 0;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.<br>Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
    </div>
    <div class="footer">
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} Quiz Website. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from,
      to: normalizedEmail,
      subject: '🔑 Mã xác thực đặt lại mật khẩu (Quiz Website)',
      text: `Mã OTP của bạn là: ${otp}. Mã này sẽ hết hạn sau ${Math.round(ttlSec/60)} phút.`,
      html: htmlContent
    });
    // Only persist after successful send
    const resetId = generateCuid();
    const createdAt = formatDateForMySQL();
    await query(
      'INSERT INTO PasswordReset (id, email, userId, otpHash, expiresAt, attempts, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [resetId, normalizedEmail, user.id, otpHash, expiresAt, createdAt]
    );
    return res.status(204).end();
  } catch (e) {
    console.error('Failed to send OTP email');
    return res.status(500).json({ message: 'Không gửi được email' });
  }
});

router.post('/reset-with-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body || {};
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Thiếu dữ liệu' });
  const normalizedEmail = email.toLowerCase().trim();
  const user = await queryOne('SELECT id, email FROM User WHERE email = ?', [normalizedEmail]);
  if (!user) return res.status(404).json({ message: 'Email không tồn tại' });

  const now = formatDateForMySQL();
  const record = await queryOne(
    'SELECT id, otpHash, attempts FROM PasswordReset WHERE email = ? AND usedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC LIMIT 1',
    [normalizedEmail, now]
  );
  if (!record) return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
  const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
  if (record.attempts >= maxAttempts) return res.status(429).json({ message: 'Quá số lần nhập OTP. Vui lòng yêu cầu mã mới.' });

  const ok = await bcrypt.compare(otp, record.otpHash);
  if (!ok) {
    await query('UPDATE PasswordReset SET attempts = attempts + 1 WHERE id = ?', [record.id]);
    return res.status(400).json({ message: 'OTP không đúng' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await transaction(async (conn) => {
    const updateTime = formatDateForMySQL();
    const usedAt = formatDateForMySQL();
    await conn.execute('UPDATE User SET passwordHash = ?, updatedAt = ?, passwordChangedAt = ? WHERE id = ?', [hash, updateTime, updateTime, user.id]);
    await conn.execute('UPDATE PasswordReset SET usedAt = ? WHERE id = ?', [usedAt, record.id]);
  });
  return res.status(204).end();
});

module.exports = router;