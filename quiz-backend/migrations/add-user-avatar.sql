-- Migration: Add avatar support to User table
-- Date: 2026-01-12

ALTER TABLE User ADD COLUMN avatarUrl VARCHAR(512) DEFAULT NULL AFTER name;
