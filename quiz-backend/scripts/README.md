# Migration Scripts

This directory contains database and data migration scripts.

## Available Scripts

### `migrate-files-to-filesystem.js`

Migrates legacy files from database `content` column to filesystem storage.

**When to use**: After deploying the document storage system, run this to convert old files.

**What it does**:
1. Finds all files with `content` but no `filePath`
2. Writes content to `documents/YYYY/MM/` folders
3. Updates database with `filePath`
4. Sets `content = NULL` to save database space

**Usage**:

```bash
# Development
cd quiz-backend
node scripts/migrate-files-to-filesystem.js

# Production
NODE_ENV=production node scripts/migrate-files-to-filesystem.js
```

**Prerequisites**:
- Database migration `add-document-storage.sql` must be run first
- `.env` file configured with database credentials
- `/documents` folder created with proper permissions

**Output Example**:
```
🚀 Starting file migration...

📊 Found 15 files to migrate

📁 Base path: /path/to/quiz-backend/public/documents

✓ Migrated: test.docx → files/documents/2024/12/abc123.docx
✓ Migrated: quiz.txt → files/documents/2024/12/def456.txt
...

============================================================
📈 Migration Summary:
   Total files: 15
   ✅ Success: 15
   ❌ Failed: 0
============================================================

✨ Migration completed!
```

**Safety**:
- Does NOT delete original `content` immediately
- Sets `content = NULL` only after successful file write
- Can be re-run safely (only processes files without `filePath`)

**Rollback**:
If something goes wrong, files remain in database as backup. Restore by:
```sql
UPDATE UploadedFile SET filePath = NULL WHERE content IS NOT NULL;
```
Then delete files from filesystem and re-run migration.
