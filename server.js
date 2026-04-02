import express from 'express';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

import {
    initDatabase,
    migrateFromJSON,
    filesDB,
    logsDB,
    statsDB,
    seedsDB
} from './db.js';

import {
    decryptFile,
    moveToFinal,
    checkTools,
    STAGING_DIR,
    DECRYPTED_DIR,
    processUpload
} from './decrypt.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// ============================================
// Middleware
// ============================================
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for frontend
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(morgan('combined'));

// ============================================
// Data Storage
// ============================================
const DATA_DIR = path.join(__dirname, 'data');

// Ensure directories exist
const UPLOAD_DIRS = {
    games: path.join(DATA_DIR, 'games'),
    dlc: path.join(DATA_DIR, 'dlc'),
    apps: path.join(DATA_DIR, 'apps'),
    'virtual-console': path.join(DATA_DIR, 'virtual-console'),
    homebrew: path.join(DATA_DIR, 'homebrew'),
    seeds: path.join(DATA_DIR, 'seeds'),
    staging: STAGING_DIR,
    decrypted: DECRYPTED_DIR
};

for (const dir of Object.values(UPLOAD_DIRS)) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ============================================
// Logging System
// ============================================
async function addLog(action, details, user = 'system') {
    const ip = details.ip || 'unknown';
    return logsDB.add(action, details, user, ip);
}

// ============================================
// File Upload Configuration
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // All uploads go to staging first
        if (!existsSync(STAGING_DIR)) mkdirSync(STAGING_DIR, { recursive: true });
        cb(null, STAGING_DIR);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.cia', '.3dsx', '.3ds', '.zip'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext) || file.mimetype.includes('zip')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: CIA, 3DSX, 3DS, ZIP'));
        }
    }
});

// ============================================
// Helper Functions
// ============================================
function generateTitleId() {
    return `00040000${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
}

async function calculateFileHash(filePath) {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('hex');
}

// Parse seeddb.bin file
function parseSeedDB(buffer) {
    const seeds = [];

    if (buffer.length < 4) return seeds;

    const count = buffer.readUInt32LE(0);

    for (let i = 0; i < count; i++) {
        const offset = 0x10 + (0x20 * i);

        if (offset + 0x20 > buffer.length) break;

        const titleId = buffer.subarray(offset, offset + 8).toString('hex').toUpperCase();
        const seedValue = buffer.subarray(offset + 8, offset + 0x18);

        seeds.push({
            titleId,
            seedValue: seedValue.toString('hex')
        });
    }

    return seeds;
}

// Download seeddb.bin using native fetch
async function downloadSeedDB(url) {
    const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': '3DS-eShop-Clone/2.0' }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

async function fetchAndCacheSeeds() {
    const SEED_SOURCES = [
        'https://github.com/ihaveamac/3DS-rom-tools/raw/master/seeddb/seeddb.bin'
    ];

    let allSeeds = [];

    for (const url of SEED_SOURCES) {
        try {
            console.log(`Fetching seeds from: ${url}`);
            const buffer = await downloadSeedDB(url);
            const seeds = parseSeedDB(buffer);
            console.log(`Found ${seeds.length} seeds`);
            allSeeds = allSeeds.concat(seeds);
        } catch (error) {
            console.error(`Failed to fetch from ${url}:`, error.message);
        }
    }

    const added = await seedsDB.bulkInsert(allSeeds);
    console.log(`Added ${added} new seeds to database`);

    return seedsDB.getAll({ limit: 1 });
}

// ============================================
// API Routes - Files
// ============================================

// Get all files
app.get('/api/files', async (req, res) => {
    try {
        const { category, search, page = 1, limit = 50 } = req.query;
        const result = await filesDB.getAll({ category, search, page, limit });

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single file
app.get('/api/files/:id', async (req, res) => {
    try {
        const file = await filesDB.getById(req.params.id);

        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        res.json({ success: true, data: file });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload file - staged, then decrypted, then moved to final location
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const category = req.body.category || 'homebrew';
        const stagingPath = req.file.path;
        const fileName = req.file.originalname;
        const ext = path.extname(fileName).toLowerCase();
        
        // Determine final directory
        let finalDir = UPLOAD_DIRS[category] || UPLOAD_DIRS.homebrew;
        if (category === 'homebrew' && req.body.homebrewCategory) {
            finalDir = path.join(finalDir, req.body.homebrewCategory);
        }
        if (category === 'virtual-console' && req.body.vcSystem) {
            finalDir = path.join(finalDir, req.body.vcSystem);
        }
        
        // Calculate original SHA256
        const originalSha256 = await calculateFileHash(stagingPath);
        
        // Check if file needs decryption (CIA or 3DS)
        let finalPath;
        let decryptionResult = null;
        const needsDecryption = ['.cia', '.3ds'].includes(ext);
        
        if (needsDecryption) {
            console.log(`[Upload] Decrypting ${fileName}...`);
            
            // Log that decryption is starting
            await addLog('DECRYPTION_START', {
                fileName,
                category,
                ip: req.ip
            }, req.body.uploadedBy || 'Anonymous');
            
            // Create category subfolder in decrypted dir
            const decryptCategoryDir = path.join(DECRYPTED_DIR, category);
            if (!existsSync(decryptCategoryDir)) mkdirSync(decryptCategoryDir, { recursive: true });
            
            // Decrypt the file
            decryptionResult = await decryptFile(stagingPath, fileName, category);
            
            if (decryptionResult.success) {
                // Move decrypted file to final location
                finalPath = await moveToFinal(decryptionResult.path, finalDir, fileName);
                console.log(`[Upload] Decrypted and moved to: ${finalPath}`);
                
                // Log successful decryption
                await addLog('DECRYPTION_SUCCESS', {
                    fileName,
                    category,
                    originalSize: decryptionResult.originalSize,
                    decryptedSize: decryptionResult.size,
                    ip: req.ip
                }, req.body.uploadedBy || 'Anonymous');
            } else {
                // Decryption failed, move original to final location
                console.log(`[Upload] Decryption failed: ${decryptionResult.error}. Using original file.`);
                if (!existsSync(finalDir)) mkdirSync(finalDir, { recursive: true });
                finalPath = path.join(finalDir, fileName);
                await fs.copyFile(stagingPath, finalPath);
                
                // Log decryption failure
                await addLog('DECRYPTION_FAILED', {
                    fileName,
                    category,
                    error: decryptionResult.error,
                    ip: req.ip
                }, req.body.uploadedBy || 'Anonymous');
            }
            
            // Clean up staging file
            await fs.unlink(stagingPath);
        } else {
            // No decryption needed, move directly to final location
            if (!existsSync(finalDir)) mkdirSync(finalDir, { recursive: true });
            finalPath = path.join(finalDir, fileName);
            await fs.copyFile(stagingPath, finalPath);
            await fs.unlink(stagingPath);
            
            // Log that file was not encrypted
            await addLog('NO_DECRYPTION_NEEDED', {
                fileName,
                category,
                ip: req.ip
            }, req.body.uploadedBy || 'Anonymous');
        }
        
        const relativePath = path.relative(__dirname, finalPath).replace(/\\/g, '/');
        const finalStats = await fs.stat(finalPath);
        const finalSha256 = await calculateFileHash(finalPath);
        
        const newFile = {
            id: uuidv4(),
            name: req.body.name || path.parse(fileName).name,
            titleId: req.body.titleId || generateTitleId(),
            productCode: req.body.productCode ?? null,
            category,
            homebrewCategory: req.body.homebrewCategory ?? null,
            vcSystem: req.body.vcSystem ?? null,
            region: req.body.region || 'region-global',
            description: req.body.description ?? '',
            size: finalStats.size,
            fileName: fileName,
            filePath: relativePath,
            fileType: req.file.mimetype,
            sha256: finalSha256,
            originalSha256: needsDecryption ? originalSha256 : null,
            wasDecrypted: needsDecryption && decryptionResult?.success,
            uploadedBy: req.body.uploadedBy || 'Anonymous',
            downloadCount: 0,
            icon: req.body.icon ?? null
        };

        await filesDB.create(newFile);

        await addLog('FILE_UPLOAD', {
            fileId: newFile.id,
            fileName: newFile.name,
            category: newFile.category,
            size: newFile.size,
            sha256: finalSha256,
            wasDecrypted: newFile.wasDecrypted,
            decryptionError: decryptionResult?.error || null,
            uploadedBy: newFile.uploadedBy,
            ip: req.ip
        }, newFile.uploadedBy);

        await statsDB.update('upload', category);

        res.json({ 
            success: true, 
            data: newFile,
            decrypted: newFile.wasDecrypted,
            decryptionError: decryptionResult?.error || null
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update file metadata
app.put('/api/files/:id', async (req, res) => {
    try {
        const file = await filesDB.getById(req.params.id);

        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const updated = await filesDB.update(req.params.id, req.body);

        await addLog('FILE_UPDATE', {
            fileId: file.id,
            fileName: file.name,
            updates: req.body,
            ip: req.ip
        }, req.body.adminUser || 'admin');

        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete file
app.delete('/api/files/:id', async (req, res) => {
    try {
        const file = await filesDB.getById(req.params.id);

        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        // Delete physical file
        const filePath = path.join(__dirname, file.filePath);
        try {
            await fs.unlink(filePath);
        } catch {
            // File might not exist
        }

        await filesDB.delete(req.params.id);

        await addLog('FILE_DELETE', {
            fileId: file.id,
            fileName: file.name,
            ip: req.ip
        }, req.query.adminUser || 'admin');

        res.json({ success: true, message: 'File deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download file and track count
app.get('/api/download/:id', async (req, res) => {
    try {
        const file = await filesDB.getById(req.params.id);

        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const filePath = path.join(__dirname, file.filePath);

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ success: false, error: 'Physical file not found' });
        }

        await filesDB.incrementDownload(req.params.id);

        await addLog('FILE_DOWNLOAD', {
            fileId: file.id,
            fileName: file.name,
            downloadCount: (file.downloadCount ?? 0) + 1,
            ip: req.ip
        });

        await statsDB.update('download', file.category);

        res.download(filePath, file.fileName);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// API Routes - Logs
// ============================================
app.get('/api/logs', async (req, res) => {
    try {
        const { action, user, page = 1, limit = 100 } = req.query;
        const result = await logsDB.getAll({ action, user, page, limit });

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/logs', async (req, res) => {
    try {
        await logsDB.clear();
        await addLog('LOGS_CLEARED', { ip: req.ip }, req.query.adminUser || 'admin');
        res.json({ success: true, message: 'Logs cleared' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// API Routes - Statistics
// ============================================
app.get('/api/stats', async (req, res) => {
    try {
        const fileStats = await filesDB.getStats();
        const recentLogs = await logsDB.getRecent(20);
        const dailyStats = await logsDB.getDailyStats(7);

        res.json({
            success: true,
            data: {
                totalFiles: fileStats.totalFiles,
                totalDownloads: fileStats.totalDownloads,
                byCategory: fileStats.byCategory,
                topDownloaded: fileStats.topDownloaded,
                recentUploads: fileStats.recentUploads,
                byUser: fileStats.byUser,
                recentLogs,
                dailyStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats/uploads', async (req, res) => {
    try {
        const chartData = await filesDB.getUploadsByUser();
        res.json({ success: true, data: chartData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// API Routes - Seeds
// ============================================
app.get('/api/seeds/stats', async (req, res) => {
    try {
        const stats = await seedsDB.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/seeds', async (req, res) => {
    try {
        const { search, page = 1, limit = 100 } = req.query;

        let result = await seedsDB.getAll({ search, page, limit });

        // If no seeds, try to fetch from sources
        if (result.pagination.total === 0) {
            await fetchAndCacheSeeds();
            result = await seedsDB.getAll({ search, page, limit });
        }

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/seeds/:titleId', async (req, res) => {
    try {
        let seed = await seedsDB.getByTitleId(req.params.titleId);

        if (!seed) {
            await fetchAndCacheSeeds();
            seed = await seedsDB.getByTitleId(req.params.titleId);
        }

        if (!seed) {
            return res.status(404).json({ success: false, error: 'Seed not found for this title' });
        }

        res.json({ success: true, data: seed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/seeds/:titleId/download', async (req, res) => {
    try {
        let seed = await seedsDB.getByTitleId(req.params.titleId);

        if (!seed) {
            await fetchAndCacheSeeds();
            seed = await seedsDB.getByTitleId(req.params.titleId);
        }

        if (!seed) {
            return res.status(404).json({ success: false, error: 'Seed not found for this title' });
        }

        await seedsDB.incrementDownload(seed.titleId);

        await addLog('SEED_DOWNLOAD', {
            titleId: seed.titleId,
            downloadCount: (seed.downloadCount ?? 0) + 1,
            ip: req.ip
        });

        const seedBuffer = Buffer.from(seed.seedValue, 'hex');
        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${seed.titleId}.dat"`,
            'Content-Length': seedBuffer.length
        });
        res.send(seedBuffer);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/seeds/refresh', async (req, res) => {
    try {
        await fetchAndCacheSeeds();
        const stats = await seedsDB.getStats();

        await addLog('SEEDS_REFRESHED', {
            count: stats.totalSeeds,
            ip: req.ip
        }, req.body.adminUser || 'admin');

        res.json({ success: true, count: stats.totalSeeds });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/seeds/upload', upload.single('seeddb'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const buffer = await fs.readFile(req.file.path);
        const newSeeds = parseSeedDB(buffer);

        if (newSeeds.length === 0) {
            await fs.unlink(req.file.path);
            return res.status(400).json({ success: false, error: 'Invalid seeddb.bin file' });
        }

        const added = await seedsDB.bulkInsert(newSeeds);
        await fs.unlink(req.file.path);

        const stats = await seedsDB.getStats();

        await addLog('SEEDS_UPLOADED', {
            newSeeds: newSeeds.length,
            added,
            total: stats.totalSeeds,
            ip: req.ip
        }, req.body.uploadedBy || 'Anonymous');

        res.json({
            success: true,
            message: `Added ${added} new seeds (${stats.totalSeeds} total)`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/seeds/:titleId/qr', (req, res) => {
    try {
        const titleId = req.params.titleId.toUpperCase();
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const downloadUrl = `${baseUrl}/api/seeds/${titleId}/download`;

        res.json({
            success: true,
            data: {
                titleId,
                downloadUrl,
                fbiPath: `sd:/fbi/seed/${titleId}.dat`
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Decryption API Routes
// ============================================

// Check decryptor tools status
app.get('/api/decrypt/tools', async (req, res) => {
    try {
        const tools = await checkTools();
        const allInstalled = Object.values(tools).every(t => t.installed);
        
        res.json({
            success: true,
            allInstalled,
            tools
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Error Handling
// ============================================
app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 5GB.'
            });
        }
    }

    res.status(500).json({ success: false, error: err.message });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// Start Server
// ============================================
async function startServer() {
    try {
        // Initialize MariaDB connection
        await initDatabase();

        // Check if migration is needed (JSON files exist)
        const dbDir = path.join(DATA_DIR, 'db');
        const dbFiles = ['files.json', 'logs.json', 'stats.json', 'seeds.json'];
        let needsMigration = false;

        for (const f of dbFiles) {
            try {
                await fs.access(path.join(dbDir, f));
                needsMigration = true;
                break;
            } catch {}
        }

        if (needsMigration) {
            console.log('Found JSON files, migrating to MariaDB...');
            await migrateFromJSON(DATA_DIR);

            // Rename JSON files to .bak after migration
            for (const f of dbFiles) {
                const jsonPath = path.join(dbDir, f);
                try {
                    await fs.access(jsonPath);
                    const bakPath = `${jsonPath}.bak`;
                    await fs.rename(jsonPath, bakPath);
                    console.log(`Renamed ${f} to ${f}.bak`);
                } catch {}
            }
        }

        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════╗
║         3DS eShop Clone Server                ║
║═══════════════════════════════════════════════║
║  Running on: http://localhost:${PORT}           ║
║  Admin Panel: http://localhost:${PORT}/admin.html║
║  Database: MariaDB                            ║
║  Node.js: ${process.version.padEnd(27)}  ║
╚═══════════════════════════════════════════════╝
            `);

            addLog('SERVER_START', { port: PORT, nodeVersion: process.version });
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        console.log('\nMake sure MariaDB is running and configured in .env:');
        console.log('  DB_HOST=localhost');
        console.log('  DB_PORT=3306');
        console.log('  DB_USER=root');
        console.log('  DB_PASSWORD=yourpassword');
        console.log('  DB_NAME=3ds_eshop');
        process.exit(1);
    }
}

startServer();
