const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mysql = require('mysql2/promise');
const fs = require('fs').promises;

async function runMigration() {
  console.log('🔧 Running database migration...\n');
  
  try {
    // Connect to database
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    console.log('✅ Connected to database');

    // Read migration file
    const migrationSQL = await fs.readFile(
      path.join(__dirname, '../migrations/add-document-storage.sql'),
      'utf-8'
    );

    console.log('📄 Executing migration SQL...\n');

    // Execute migration
    await connection.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Changes made:');
    console.log('   - Added `filePath` column to UploadedFile table');
    console.log('   - Modified `content` column to be optional');
    console.log('   - Added index on `filePath` for performance\n');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('\n⚠️  Column already exists - migration may have been run before');
      console.log('✅ This is OK - your database is already up to date!\n');
      process.exit(0);
    }
    
    process.exit(1);
  }
}

runMigration();
