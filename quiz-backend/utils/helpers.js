const crypto = require('crypto');

/**
 * Generate CUID-like ID (compatible with Prisma's default)
 * Format: c + timestamp_base36 + random_string
 */
function generateCuid() {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(12).toString('base64')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .substring(0, 12);
  return `c${timestamp}${randomPart}`;
}

/**
 * Generate Access Code with LIGMA format
 * Format: LIGMA + 7 chars (A-Z) + 3 digits (0-9)
 * Example: LIGMAABCDEFG123
 */
function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  
  let randomText = '';
  for (let i = 0; i < 7; i++) {
    randomText += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  let randomDigits = '';
  for (let i = 0; i < 3; i++) {
    randomDigits += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  
  return `LIGMA${randomText}${randomDigits}`;
}

/**
 * Generate Access Code for Quiz with SUGMA format
 * Format: SUGMA + 7 chars (A-Z) + 3 digits (0-9)
 */
function generateQuizAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  
  let randomText = '';
  for (let i = 0; i < 7; i++) {
    randomText += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  let randomDigits = '';
  for (let i = 0; i < 3; i++) {
    randomDigits += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  
  return `SUGMA${randomText}${randomDigits}`;
}


/**
 * Format date for MySQL DATETIME
 */
function formatDateForMySQL(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Parse MySQL DATETIME to JS Date
 */
function parseMySQLDate(mysqlDate) {
  if (!mysqlDate) return null;
  return new Date(mysqlDate);
}

/**
 * Safely parse JSON field from MySQL
 */
function parseJSON(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Stringify JSON for MySQL
 */
function stringifyJSON(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Build WHERE IN clause safely
 */
function buildWhereIn(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { clause: 'FALSE', params: [] };
  }
  const placeholders = values.map(() => '?').join(', ');
  return {
    clause: `IN (${placeholders})`,
    params: values,
  };
}

/**
 * Convert boolean to MySQL TINYINT
 */
function boolToInt(value) {
  return value ? 1 : 0;
}

/**
 * Convert MySQL TINYINT to boolean
 */
function intToBool(value) {
  return value === 1;
}

/**
 * Escape LIKE pattern for MySQL
 */
function escapeLike(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Build pagination params
 */
function buildPagination(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return { limit, offset };
}

module.exports = {
  generateCuid,
  generateAccessCode,
  generateQuizAccessCode,
  formatDateForMySQL,
  parseMySQLDate,
  parseJSON,
  stringifyJSON,
  buildWhereIn,
  boolToInt,
  intToBool,
  escapeLike,
  buildPagination,
};
