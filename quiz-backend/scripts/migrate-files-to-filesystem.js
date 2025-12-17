const path = require('path');

// Load .env from parent directory (quiz-backend/)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mysql = require('mysql2/promise');
const fs = require('fs').promises;

/**
 * Migration Script: Move files from database content to filesystem
 * 
 * This script:
 * 1. Finds all files with content but no filePath
 * 2. Writes content to filesystem in organized folders
 * 3. Updates database with filePath
 * 4. Optionally clears content to save DB space
 */

async function migrateFilesToFilesystem() {
  console.log('🚀 Starting file migration...\n');
  
  // Database connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    // Get all files with content but no filePath
    const [files] = await connection.query(
      'SELECT id, name, type, content FROM UploadedFile WHERE content IS NOT NULL AND (filePath IS NULL OR filePath = "")'
    );

    console.log(`📊 Found ${files.length} files to migrate\n`);

    if (files.length === 0) {
      console.log('✅ No files to migrate. All done!');
      return;
    }

    // Determine base path
    const isProd = process.env.NODE_ENV === 'production';
    const documentsBasePath = isProd
      ? path.join(__dirname, '../documents')
      : path.join(__dirname, '../public/documents');

    console.log(`📁 Base path: ${documentsBasePath}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        // Use current date for organization
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        
        // Get file extension
        const ext = path.extname(file.name);
        const filename = `${file.id}${ext}`;
        
        // Create directory structure
        const dirPath = path.join(documentsBasePath, String(year), month);
        await fs.mkdir(dirPath, { recursive: true });
        
        // Full file path
        const filePath = path.join(dirPath, filename);
        const relativePath = `files/documents/${year}/${month}/${filename}`;
        
        // Write file content to disk
        if (file.type === 'docs') {
          // Base64 encoded Word file
          const buffer = Buffer.from(file.content, 'base64');
          await fs.writeFile(filePath, buffer);
        } else {
          // Text file
          await fs.writeFile(filePath, file.content, 'utf-8');
        }
        
        // Update database
        await connection.query(
          'UPDATE UploadedFile SET filePath = ?, content = NULL WHERE id = ?',
          [relativePath, file.id]
        );
        
        successCount++;
        console.log(`✓ Migrated: ${file.name} → ${relativePath}`);
      } catch (error) {
        failCount++;
        console.error(`✗ Failed to migrate ${file.name}:`, error.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`📈 Migration Summary:`);
    console.log(`   Total files: ${files.length}`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log('='.repeat(60));
    console.log('\n✨ Migration completed!\n');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run migration
migrateFilesToFilesystem()
  .then(() => {
    console.log('👋 Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
