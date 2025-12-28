require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, close } = require('./utils/db');

async function applyMigration() {
  try {
    const sqlPath = path.join(__dirname, 'migrations', 'add_password_changed_at.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Applying migration...');
    await pool.query(sql);
    console.log('Migration applied successfully!');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists, skipping...');
    } else {
      console.error('Migration failed:', error);
    }
  } finally {
    await close();
  }
}

applyMigration();
