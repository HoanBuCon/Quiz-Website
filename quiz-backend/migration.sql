-- MySQL Migration Script from Prisma Schema
-- Run this script to create all tables for Quiz Website

-- Create database if not exists
-- CREATE DATABASE IF NOT EXISTS quiz_website CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE quiz_website;

-- =============================================
-- User Table
-- =============================================
CREATE TABLE IF NOT EXISTS `User` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `passwordHash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `lastLoginAt` DATETIME(3) DEFAULT NULL,
  `lastLogoutAt` DATETIME(3) DEFAULT NULL,
  `lastActivityAt` DATETIME(3) DEFAULT NULL,
  INDEX `idx_user_email` (`email`),
  INDEX `idx_user_lastActivityAt` (`lastActivityAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- Class Table
-- =============================================
CREATE TABLE IF NOT EXISTS `Class` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `isPublic` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `ownerId` VARCHAR(191) NOT NULL,
  INDEX `idx_class_ownerId` (`ownerId`),
  INDEX `idx_class_isPublic` (`isPublic`),
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- Quiz Table
-- =============================================
CREATE TABLE IF NOT EXISTS `Quiz` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `published` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `ownerId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  INDEX `idx_quiz_ownerId` (`ownerId`),
  INDEX `idx_quiz_classId` (`classId`),
  INDEX `idx_quiz_published` (`published`),
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- Question Table
-- =============================================
CREATE TABLE IF NOT EXISTS `Question` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `question` TEXT NOT NULL,
  `type` ENUM('single', 'multiple', 'text', 'drag', 'composite') NOT NULL,
  `options` JSON DEFAULT NULL,
  `correctAnswers` JSON NOT NULL,
  `explanation` MEDIUMTEXT DEFAULT NULL,
  `questionImage` VARCHAR(512) DEFAULT NULL,
  `optionImages` JSON DEFAULT NULL,
  `quizId` VARCHAR(191) NOT NULL,
  `parentId` VARCHAR(191) DEFAULT NULL,
  INDEX `idx_question_quizId` (`quizId`),
  INDEX `idx_question_parentId` (`parentId`),
  FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`parentId`) REFERENCES `Question`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- QuizSession Table
-- =============================================
CREATE TABLE IF NOT EXISTS `QuizSession` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `score` INT NOT NULL,
  `totalQuestions` INT NOT NULL,
  `timeSpent` INT NOT NULL,
  `answers` JSON NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `quizSnapshot` JSON DEFAULT NULL,
  `quizId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  INDEX `idx_session_quizId` (`quizId`),
  INDEX `idx_session_userId` (`userId`),
  INDEX `idx_session_completedAt` (`completedAt`),
  FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- UploadedFile Table
-- =============================================
CREATE TABLE IF NOT EXISTS `UploadedFile` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('docs', 'json', 'txt') NOT NULL,
  `size` INT NOT NULL,
  `content` LONGTEXT DEFAULT NULL,
  `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `userId` VARCHAR(191) NOT NULL,
  INDEX `idx_file_userId` (`userId`),
  INDEX `idx_file_uploadedAt` (`uploadedAt`),
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PublicItem Table
-- =============================================
CREATE TABLE IF NOT EXISTS `PublicItem` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `targetType` ENUM('class', 'quiz') NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `unique_targetType_targetId` (`targetType`, `targetId`),
  INDEX `idx_public_targetType` (`targetType`),
  INDEX `idx_public_targetId` (`targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ShareItem Table
-- =============================================
CREATE TABLE IF NOT EXISTS `ShareItem` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `ownerId` VARCHAR(191) NOT NULL,
  `targetType` ENUM('class', 'quiz') NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `unique_shareitem_targetType_targetId` (`targetType`, `targetId`),
  INDEX `idx_share_ownerId` (`ownerId`),
  INDEX `idx_share_code` (`code`),
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SharedAccess Table
-- =============================================
CREATE TABLE IF NOT EXISTS `SharedAccess` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(191) NOT NULL,
  `targetType` ENUM('class', 'quiz') NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `accessLevel` ENUM('full', 'navigationOnly', 'hidden') NOT NULL DEFAULT 'full',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `unique_access_userId_targetType_targetId` (`userId`, `targetType`, `targetId`),
  INDEX `idx_access_userId` (`userId`),
  INDEX `idx_access_targetType` (`targetType`),
  INDEX `idx_access_targetId` (`targetId`),
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ChatMessage Table
-- =============================================
CREATE TABLE IF NOT EXISTS `ChatMessage` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(191) NOT NULL,
  `content` TEXT DEFAULT NULL,
  `attachmentUrl` VARCHAR(512) DEFAULT NULL,
  `attachmentType` ENUM('image', 'video', 'file') DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_chat_userId` (`userId`),
  INDEX `idx_chat_createdAt` (`createdAt`),
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ChatReadStatus Table
-- =============================================
CREATE TABLE IF NOT EXISTS `ChatReadStatus` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(191) NOT NULL UNIQUE,
  `lastReadAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `idx_chatread_userId` (`userId`),
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PasswordReset Table
-- =============================================
CREATE TABLE IF NOT EXISTS `PasswordReset` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `email` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) DEFAULT NULL,
  `otpHash` VARCHAR(255) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `usedAt` DATETIME(3) DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_reset_email_createdAt` (`email`, `createdAt`),
  INDEX `idx_reset_expiresAt` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- QuizAttempt Table
-- =============================================
CREATE TABLE IF NOT EXISTS `QuizAttempt` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(191) NOT NULL,
  `quizId` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) DEFAULT NULL,
  `quizSessionId` VARCHAR(191) DEFAULT NULL UNIQUE,
  INDEX `idx_attempt_userId_quizId_startedAt` (`userId`, `quizId`, `startedAt`),
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`quizSessionId`) REFERENCES `QuizSession`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- Done
-- =============================================
-- =============================================
-- BannedAccess Table
-- =============================================
CREATE TABLE IF NOT EXISTS `BannedAccess` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(191) NOT NULL,
  `targetType` ENUM('class', 'quiz') NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `bannedCode` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `unique_ban_user_target_code` (`userId`, `targetType`, `targetId`, `bannedCode`),
  INDEX `idx_ban_userId` (`userId`),
  INDEX `idx_ban_targetId` (`targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- Done
-- =============================================
SELECT 'Migration completed successfully!' AS Status;
