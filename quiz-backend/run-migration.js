// Migration runner script
// Run this to apply the explanation column size fix
require('dotenv').config();
const { query } = require('./utils/db');

async function runMigration() {
  console.log('Starting migration: Fix explanation column size...');
  
  try {
    // Alter the table
    await query(`
      ALTER TABLE \`Question\` 
      MODIFY COLUMN \`explanation\` MEDIUMTEXT DEFAULT NULL
    `);
    
    console.log('✓ Migration completed successfully!');
    console.log('✓ Column "explanation" upgraded to MEDIUMTEXT');
    
    // Verify the change
    const result = await query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Question'
        AND COLUMN_NAME = 'explanation'
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
