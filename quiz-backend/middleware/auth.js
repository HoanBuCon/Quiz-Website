const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');
const { formatDateForMySQL } = require('../utils/helpers');

function authRequired(req, res, next) {
  // Priority 1: Read token from httpOnly cookie (recommended)
  const cookieToken = req.cookies?.auth_token;
  
  // Priority 2: Fallback to Authorization header (backward compatibility)
  // BUT ignore dummy token from frontend
  const headerToken = req.headers.authorization?.startsWith('Bearer ') 
    ? req.headers.authorization.slice(7) 
    : null;
  
  // Ignore dummy token - frontend uses this for backward compatibility
  const validHeaderToken = (headerToken && headerToken !== '_cookie_auth_') ? headerToken : null;
  
  const token = cookieToken || validHeaderToken;
  
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

