const mysql = require('mysql2/promise');

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'quiz_website',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+00:00', // Use UTC
});

// Test connection on startup
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('[DB] MySQL connection pool established successfully');
    connection.release();
  } catch (err) {
    console.error('[DB] Failed to connect to MySQL:', err.message);
    console.error('[DB] Server will continue, but database operations will fail');
  }
}

// Execute query with automatic connection handling
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Get a single row
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Execute a transaction
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Gracefully close pool
async function close() {
  await pool.end();
  console.log('[DB] MySQL connection pool closed');
}

module.exports = {
  pool,
  query,
  queryOne,
  transaction,
  testConnection,
  close,
};
