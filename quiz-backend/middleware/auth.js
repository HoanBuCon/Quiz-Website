const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');
const { formatDateForMySQL } = require('../utils/helpers');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'devsecret' : null);
    if (!secret) return res.status(500).json({ message: 'Server misconfigured' });
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, email: payload.email };
    // Update lastActivityAt in background; don't block request
    try {
      if (req.user?.id) {
        const now = formatDateForMySQL();
        query(
          'UPDATE User SET lastActivityAt = ?, updatedAt = ? WHERE id = ?',
          [now, now, req.user.id]
        ).catch(() => {});
      }
    } catch (_) {}
    next();
  } catch (_e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { authRequired };

