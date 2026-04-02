-- 3DS eShop Clone Database Schema
-- Run this file to create the database and tables in MariaDB

-- Create database
CREATE DATABASE IF NOT EXISTS `3ds_eshop` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `3ds_eshop`;

-- Files table
CREATE TABLE IF NOT EXISTS `files` (
    `id` VARCHAR(36) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `titleId` VARCHAR(16),
    `productCode` VARCHAR(20),
    `category` VARCHAR(50) NOT NULL,
    `homebrewCategory` VARCHAR(50),
    `vcSystem` VARCHAR(20),
    `region` VARCHAR(20) DEFAULT 'region-global',
    `description` TEXT,
    `size` BIGINT DEFAULT 0,
    `fileName` VARCHAR(255),
    `filePath` VARCHAR(500),
    `fileType` VARCHAR(100),
    `sha256` VARCHAR(64),
    `uploadedBy` VARCHAR(100) DEFAULT 'Anonymous',
    `downloadCount` INT DEFAULT 0,
    `uploadDate` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `lastModified` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `icon` TEXT,
    INDEX `idx_category` (`category`),
    INDEX `idx_titleId` (`titleId`),
    INDEX `idx_uploadedBy` (`uploadedBy`),
    INDEX `idx_uploadDate` (`uploadDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Logs table
CREATE TABLE IF NOT EXISTS `logs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `action` VARCHAR(50) NOT NULL,
    `details` JSON,
    `user` VARCHAR(100),
    `ip` VARCHAR(45),
    INDEX `idx_timestamp` (`timestamp`),
    INDEX `idx_action` (`action`),
    INDEX `idx_user` (`user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stats table
CREATE TABLE IF NOT EXISTS `stats` (
    `date` DATE PRIMARY KEY,
    `uploads` INT DEFAULT 0,
    `downloads` INT DEFAULT 0,
    `byCategory` JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seeds table
CREATE TABLE IF NOT EXISTS `seeds` (
    `titleId` VARCHAR(16) PRIMARY KEY,
    `seedValue` VARCHAR(32) NOT NULL,
    `downloadCount` INT DEFAULT 0,
    INDEX `idx_titleId` (`titleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(36) PRIMARY KEY,
    `username` VARCHAR(50) UNIQUE NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `isAdmin` TINYINT(1) DEFAULT 0,
    `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
