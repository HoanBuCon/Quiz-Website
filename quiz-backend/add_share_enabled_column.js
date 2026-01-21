require('dotenv').config();
const { query, close } = require('./utils/db');

async function migrate() {
  try {
    console.log('Adding isEnabled column to ShareItem table...');
    
    // Check if column exists
    const columns = await query("SHOW COLUMNS FROM ShareItem LIKE 'isEnabled'");
    
    if (columns.length === 0) {
      await query(`
        ALTER TABLE ShareItem
        ADD COLUMN isEnabled TINYINT(1) NOT NULL DEFAULT 1
      `);
      console.log('Column isEnabled added successfully.');
    } else {
      console.log('Column isEnabled already exists.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await close();
  }
}

migrate();
