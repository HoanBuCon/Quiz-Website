-- Migration: Add Document Storage Support
-- Date: 2024-12-17
-- Description: Add filePath column to UploadedFile table and make content optional

-- Add filePath column and make content optional
ALTER TABLE `UploadedFile` 
  ADD COLUMN `filePath` VARCHAR(512) DEFAULT NULL AFTER `content`,
  MODIFY COLUMN `content` LONGTEXT DEFAULT NULL;

-- Add index for efficient file lookup
CREATE INDEX `idx_file_filePath` ON `UploadedFile`(`filePath`);

-- Verify changes
SELECT 'Migration completed successfully! Added filePath column and index.' AS Status;
