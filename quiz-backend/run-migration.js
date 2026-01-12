// Migration runner script
// Run this to add avatarUrl column to User table
require('dotenv').config();
const { query } = require('./utils/db');

async function runMigration() {
  console.log('Starting migration: Add avatarUrl column to User table...');
  
  try {
    // Check if column already exists
    const checkResult = await query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'User'
        AND COLUMN_NAME = 'avatarUrl'
    `);
    
    if (checkResult && checkResult.length > 0) {
      console.log('⚠️  Column "avatarUrl" already exists. Skipping migration.');
      process.exit(0);
      return;
    }
    
    // Alter the table
    await query(`
      ALTER TABLE \`User\` 
      ADD COLUMN \`avatarUrl\` VARCHAR(512) DEFAULT NULL AFTER \`name\`
    `);
    
    console.log('✓ Migration completed successfully!');
    console.log('✓ Column "avatarUrl" added to User table');
    
    // Verify the change
    const result = await query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'User'
        AND COLUMN_NAME = 'avatarUrl'
    `);
    
    console.log('✓ Verification:', result[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

runMigration();
