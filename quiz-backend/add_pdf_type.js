/**
 * One-time migration: add 'pdf' to UploadedFile.type ENUM
 * Run: node add_pdf_type.js
 */
require('dotenv').config();
const { query } = require('./utils/db');

(async () => {
  try {
    console.log('Running migration: add pdf to UploadedFile.type ENUM...');
    await query(
      "ALTER TABLE `UploadedFile` MODIFY COLUMN `type` ENUM('docs', 'json', 'txt', 'pdf') NOT NULL"
    );
    console.log('✅ Migration successful! UploadedFile.type now accepts: docs, json, txt, pdf');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
})();
