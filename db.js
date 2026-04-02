const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

let pool;

// ============================================
// Initialize Database Connection
// ============================================
async function initDatabase() {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || '3ds_eshop',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4'
        });

        // Test connection
        const connection = await pool.getConnection();
        console.log('MariaDB connected successfully');
        connection.release();

        // Create tables if not exist
        await createTables();

        return pool;
    } catch (error) {
        console.error('MariaDB connection failed:', error.message);
        console.log('Make sure MariaDB is running and credentials are correct in .env');
        throw error;
    }
}

async function createTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS files (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            titleId VARCHAR(16),
            productCode VARCHAR(20),
            category VARCHAR(50) NOT NULL,
            homebrewCategory VARCHAR(50),
            vcSystem VARCHAR(20),
            region VARCHAR(20) DEFAULT 'region-global',
            description TEXT,
            size BIGINT DEFAULT 0,
            fileName VARCHAR(255),
            filePath VARCHAR(500),
            fileType VARCHAR(100),
            sha256 VARCHAR(64),
            uploadedBy VARCHAR(100) DEFAULT 'Anonymous',
            downloadCount INT DEFAULT 0,
            uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP,
            lastModified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            icon TEXT,
            INDEX idx_category (category),
            INDEX idx_titleId (titleId),
            INDEX idx_uploadedBy (uploadedBy),
            INDEX idx_uploadDate (uploadDate)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS logs (
            id VARCHAR(36) PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            action VARCHAR(50) NOT NULL,
            details JSON,
            user VARCHAR(100),
            ip VARCHAR(45),
            INDEX idx_timestamp (timestamp),
            INDEX idx_action (action),
            INDEX idx_user (user)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS stats (
            date DATE PRIMARY KEY,
            uploads INT DEFAULT 0,
            downloads INT DEFAULT 0,
            byCategory JSON
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS seeds (
            titleId VARCHAR(16) PRIMARY KEY,
            seedValue VARCHAR(32) NOT NULL,
            downloadCount INT DEFAULT 0,
            INDEX idx_titleId (titleId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            passwordHash VARCHAR(255) NOT NULL,
            isAdmin TINYINT(1) DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('Database tables verified/created');
}

// ============================================
// Files Operations
// ============================================
const filesDB = {
    async getAll(options = {}) {
        const { category, search, page = 1, limit = 50 } = options;
        
        let where = [];
        let params = [];
        
        if (category && category !== 'all') {
            where.push('category = ?');
            params.push(category);
        }
        
        if (search) {
            where.push('(LOWER(name) LIKE ? OR LOWER(titleId) LIKE ?)');
            params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
        }
        
        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        
        const [countResult] = await pool.query(`SELECT COUNT(*) as count FROM files ${whereClause}`, params);
        const total = countResult[0].count;
        
        const offset = (page - 1) * limit;
        const [data] = await pool.query(
            `SELECT * FROM files ${whereClause} ORDER BY uploadDate DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        
        return {
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };
    },

    async getById(id) {
        const [rows] = await pool.query('SELECT * FROM files WHERE id = ?', [id]);
        return rows[0] || null;
    },

    async create(file) {
        const id = file.id || uuidv4();
        await pool.query(`
            INSERT INTO files (id, name, titleId, productCode, category, homebrewCategory, vcSystem,
                region, description, size, fileName, filePath, fileType, sha256, uploadedBy,
                downloadCount, uploadDate, lastModified, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
        `, [
            id,
            file.name,
            file.titleId || null,
            file.productCode || null,
            file.category,
            file.homebrewCategory || null,
            file.vcSystem || null,
            file.region || 'region-global',
            file.description || '',
            file.size || 0,
            file.fileName,
            file.filePath,
            file.fileType,
            file.sha256 || null,
            file.uploadedBy || 'Anonymous',
            file.downloadCount || 0,
            file.icon || null
        ]);
        
        return { ...file, id };
    },

    async update(id, updates) {
        const allowedFields = ['name', 'titleId', 'productCode', 'description', 'region', 'category',
            'homebrewCategory', 'vcSystem', 'uploadedBy', 'icon'];
        
        const setClauses = [];
        const params = [];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                params.push(updates[field]);
            }
        }
        
        if (setClauses.length === 0) return this.getById(id);
        
        setClauses.push('lastModified = NOW()');
        params.push(id);
        
        await pool.query(`UPDATE files SET ${setClauses.join(', ')} WHERE id = ?`, params);
        
        return this.getById(id);
    },

    async delete(id) {
        await pool.query('DELETE FROM files WHERE id = ?', [id]);
    },

    async incrementDownload(id) {
        await pool.query('UPDATE files SET downloadCount = downloadCount + 1 WHERE id = ?', [id]);
    },

    async getStats() {
        const [totalFiles] = await pool.query('SELECT COUNT(*) as count FROM files');
        const [totalDownloads] = await pool.query('SELECT COALESCE(SUM(downloadCount), 0) as total FROM files');
        const [byCategory] = await pool.query('SELECT category, COUNT(*) as count FROM files GROUP BY category');
        const [topDownloaded] = await pool.query('SELECT * FROM files ORDER BY downloadCount DESC LIMIT 10');
        const [recentUploads] = await pool.query('SELECT * FROM files ORDER BY uploadDate DESC LIMIT 10');
        const [byUser] = await pool.query('SELECT uploadedBy, COUNT(*) as count FROM files GROUP BY uploadedBy');
        
        const byCategoryObj = {};
        byCategory.forEach(row => { byCategoryObj[row.category] = row.count; });
        
        const byUserObj = {};
        byUser.forEach(row => { byUserObj[row.uploadedBy] = row.count; });
        
        return {
            totalFiles: totalFiles[0].count,
            totalDownloads: totalDownloads[0].total,
            byCategory: byCategoryObj,
            topDownloaded,
            recentUploads,
            byUser: byUserObj
        };
    },

    async getUploadsByUser() {
        const [rows] = await pool.query(`
            SELECT uploadedBy as name, COUNT(*) as uploads, COALESCE(SUM(downloadCount), 0) as downloads
            FROM files GROUP BY uploadedBy ORDER BY uploads DESC
        `);
        return rows;
    }
};

// ============================================
// Logs Operations
// ============================================
const logsDB = {
    async add(action, details, user = 'system', ip = 'unknown') {
        const id = uuidv4();
        const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;
        
        await pool.query(
            'INSERT INTO logs (id, timestamp, action, details, user, ip) VALUES (?, NOW(), ?, ?, ?, ?)',
            [id, action, detailsStr, user, ip]
        );
        
        // Keep only last 1000 logs
        await pool.query(`
            DELETE FROM logs WHERE id NOT IN (
                SELECT id FROM (SELECT id FROM logs ORDER BY timestamp DESC LIMIT 1000) as t
            )
        `);
        
        console.log(`[${new Date().toISOString()}] ${action}: ${detailsStr}`);
        return { id, action, details, user, ip };
    },

    async getAll(options = {}) {
        const { action, user, page = 1, limit = 100 } = options;
        
        let where = [];
        let params = [];
        
        if (action) {
            where.push('action = ?');
            params.push(action);
        }
        
        if (user) {
            where.push('LOWER(user) LIKE ?');
            params.push(`%${user.toLowerCase()}%`);
        }
        
        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        
        const [countResult] = await pool.query(`SELECT COUNT(*) as count FROM logs ${whereClause}`, params);
        const total = countResult[0].count;
        
        const offset = (page - 1) * limit;
        const [data] = await pool.query(
            `SELECT * FROM logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        
        // Parse JSON details
        data.forEach(row => {
            if (typeof row.details === 'string') {
                try { row.details = JSON.parse(row.details); } catch (e) {}
            }
        });
        
        return {
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        };
    },

    async clear() {
        await pool.query('DELETE FROM logs');
    },

    async getRecent(limit = 20) {
        const [rows] = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', [limit]);
        rows.forEach(row => {
            if (typeof row.details === 'string') {
                try { row.details = JSON.parse(row.details); } catch (e) {}
            }
        });
        return rows;
    },

    async getDailyStats(days = 7) {
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const [uploads] = await pool.query(
                "SELECT COUNT(*) as count FROM logs WHERE action = 'FILE_UPLOAD' AND DATE(timestamp) = ?",
                [dateStr]
            );
            const [downloads] = await pool.query(
                "SELECT COUNT(*) as count FROM logs WHERE action = 'FILE_DOWNLOAD' AND DATE(timestamp) = ?",
                [dateStr]
            );
            
            result.push({
                date: dateStr,
                label: date.toLocaleDateString('en-US', { weekday: 'short' }),
                uploads: uploads[0].count,
                downloads: downloads[0].count
            });
        }
        return result;
    }
};

// ============================================
// Stats Operations
// ============================================
const statsDB = {
    async update(action, category) {
        const today = new Date().toISOString().split('T')[0];
        
        const [existing] = await pool.query('SELECT * FROM stats WHERE date = ?', [today]);
        
        if (existing.length > 0) {
            let byCategory = existing[0].byCategory;
            if (typeof byCategory === 'string') {
                byCategory = JSON.parse(byCategory);
            }
            
            if (action === 'upload') {
                byCategory[category] = (byCategory[category] || 0) + 1;
            }
            
            await pool.query(`UPDATE stats SET 
                uploads = uploads + ?, 
                downloads = downloads + ?,
                byCategory = ?
                WHERE date = ?`, [
                action === 'upload' ? 1 : 0,
                action === 'download' ? 1 : 0,
                JSON.stringify(byCategory),
                today
            ]);
        } else {
            let byCategory = {};
            if (action === 'upload') {
                byCategory[category] = 1;
            }
            
            await pool.query(
                'INSERT INTO stats (date, uploads, downloads, byCategory) VALUES (?, ?, ?, ?)',
                [today, action === 'upload' ? 1 : 0, action === 'download' ? 1 : 0, JSON.stringify(byCategory)]
            );
        }
        
        // Clean old stats (keep 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        await pool.query('DELETE FROM stats WHERE date < ?', [thirtyDaysAgo.toISOString().split('T')[0]]);
    },

    async getAll() {
        const [rows] = await pool.query('SELECT * FROM stats ORDER BY date DESC');
        return rows;
    }
};

// ============================================
// Seeds Operations
// ============================================
const seedsDB = {
    async getAll(options = {}) {
        const { search, page = 1, limit = 100 } = options;
        
        let where = [];
        let params = [];
        
        if (search) {
            where.push('LOWER(titleId) LIKE ?');
            params.push(`%${search.toLowerCase()}%`);
        }
        
        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        
        const [countResult] = await pool.query(`SELECT COUNT(*) as count FROM seeds ${whereClause}`, params);
        const total = countResult[0].count;
        
        const offset = (page - 1) * limit;
        const [data] = await pool.query(
            `SELECT * FROM seeds ${whereClause} ORDER BY titleId ASC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        
        return {
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        };
    },

    async getByTitleId(titleId) {
        const [rows] = await pool.query('SELECT * FROM seeds WHERE titleId = ?', [titleId.toUpperCase()]);
        return rows[0] || null;
    },

    async upsert(titleId, seedValue) {
        await pool.query(`
            INSERT INTO seeds (titleId, seedValue, downloadCount)
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE seedValue = VALUES(seedValue)
        `, [titleId.toUpperCase(), seedValue]);
    },

    async incrementDownload(titleId) {
        await pool.query('UPDATE seeds SET downloadCount = downloadCount + 1 WHERE titleId = ?', [titleId.toUpperCase()]);
    },

    async bulkInsert(seeds) {
        if (seeds.length === 0) return 0;
        
        let added = 0;
        const batchSize = 100;
        
        for (let i = 0; i < seeds.length; i += batchSize) {
            const batch = seeds.slice(i, i + batchSize);
            const values = batch.map(s => [s.titleId.toUpperCase(), s.seedValue, 0]);
            
            const [result] = await pool.query(`
                INSERT IGNORE INTO seeds (titleId, seedValue, downloadCount) VALUES ?
            `, [values]);
            
            added += result.affectedRows;
        }
        
        return added;
    },

    async getStats() {
        const [totalSeeds] = await pool.query('SELECT COUNT(*) as count FROM seeds');
        const [totalDownloads] = await pool.query('SELECT COALESCE(SUM(downloadCount), 0) as total FROM seeds');
        const [topSeeds] = await pool.query('SELECT * FROM seeds WHERE downloadCount > 0 ORDER BY downloadCount DESC LIMIT 10');
        
        return {
            totalSeeds: totalSeeds[0].count,
            totalDownloads: totalDownloads[0].total,
            topSeeds
        };
    }
};

// ============================================
// Migration from JSON
// ============================================
async function migrateFromJSON(dataDir) {
    console.log('Starting migration from JSON to MariaDB...');
    
    // Migrate files
    const filesPath = path.join(dataDir, 'db', 'files.json');
    if (fs.existsSync(filesPath)) {
        const files = JSON.parse(fs.readFileSync(filesPath, 'utf8'));
        for (const file of files) {
            try {
                await filesDB.create(file);
            } catch (e) {
                console.log(`Skipped duplicate file: ${file.name}`);
            }
        }
        console.log(`Migrated ${files.length} files`);
    }
    
    // Migrate logs
    const logsPath = path.join(dataDir, 'db', 'logs.json');
    if (fs.existsSync(logsPath)) {
        const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
        for (const log of logs) {
            try {
                const details = typeof log.details === 'object' ? JSON.stringify(log.details) : log.details;
                await pool.query(
                    'INSERT IGNORE INTO logs (id, timestamp, action, details, user, ip) VALUES (?, ?, ?, ?, ?, ?)',
                    [log.id, log.timestamp, log.action, details, log.user || 'system', log.ip || 'unknown']
                );
            } catch (e) {}
        }
        console.log(`Migrated ${logs.length} logs`);
    }
    
    // Migrate stats
    const statsPath = path.join(dataDir, 'db', 'stats.json');
    if (fs.existsSync(statsPath)) {
        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        for (const stat of stats) {
            try {
                const byCategory = typeof stat.byCategory === 'object' ? JSON.stringify(stat.byCategory) : stat.byCategory;
                await pool.query(
                    'INSERT IGNORE INTO stats (date, uploads, downloads, byCategory) VALUES (?, ?, ?, ?)',
                    [stat.date, stat.uploads || 0, stat.downloads || 0, byCategory]
                );
            } catch (e) {}
        }
        console.log(`Migrated ${stats.length} stats`);
    }
    
    // Migrate seeds
    const seedsPath = path.join(dataDir, 'db', 'seeds.json');
    if (fs.existsSync(seedsPath)) {
        const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
        const added = await seedsDB.bulkInsert(seeds);
        console.log(`Migrated ${added} seeds`);
    }
    
    console.log('Migration complete!');
}

// ============================================
// Close Database
// ============================================
async function closeDatabase() {
    if (pool) {
        await pool.end();
    }
}

module.exports = {
    initDatabase,
    closeDatabase,
    migrateFromJSON,
    filesDB,
    logsDB,
    statsDB,
    seedsDB
};
