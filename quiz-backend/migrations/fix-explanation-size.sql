-- Migration: Fix explanation column size limit
-- Issue: TEXT type (65,535 bytes) is too small for long explanations with Unicode characters
-- Solution: Upgrade to MEDIUMTEXT (16,777,215 bytes)

-- Backup reminder: Always backup your database before running migrations!

ALTER TABLE `Question` 
MODIFY COLUMN `explanation` MEDIUMTEXT DEFAULT NULL;

-- Verify the change
DESCRIBE `Question`;

SELECT 'Migration completed: explanation column upgraded to MEDIUMTEXT' AS Status;
