const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');
const { initDatabase, migrateFromJSON, filesDB, logsDB, statsDB, seedsDB } = require('./db');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Request logging
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
    seeds: path.join(DATA_DIR, 'seeds')
};

Object.values(UPLOAD_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

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
        const category = req.body.category || 'homebrew';
        let uploadPath = UPLOAD_DIRS[category] || UPLOAD_DIRS.homebrew;
        
        if (category === 'homebrew' && req.body.homebrewCategory) {
            uploadPath = path.join(uploadPath, req.body.homebrewCategory);
        }
        
        if (category === 'virtual-console' && req.body.vcSystem) {
            uploadPath = path.join(uploadPath, req.body.vcSystem);
        }
        
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
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

// Upload file
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const category = req.body.category || 'homebrew';
        const relativePath = path.relative(__dirname, req.file.path).replace(/\\/g, '/');
        const sha256 = await calculateFileHash(req.file.path);
        
        const newFile = {
            id: uuidv4(),
            name: req.body.name || path.parse(req.file.originalname).name,
            titleId: req.body.titleId || generateTitleId(),
            productCode: req.body.productCode || null,
            category: category,
            homebrewCategory: req.body.homebrewCategory || null,
            vcSystem: req.body.vcSystem || null,
            region: req.body.region || 'region-global',
            description: req.body.description || '',
            size: req.file.size,
            fileName: req.file.originalname,
            filePath: relativePath,
            fileType: req.file.mimetype,
            sha256: sha256,
            uploadedBy: req.body.uploadedBy || 'Anonymous',
            downloadCount: 0,
            icon: req.body.icon || null
        };
        
        await filesDB.create(newFile);
        
        await addLog('FILE_UPLOAD', {
            fileId: newFile.id,
            fileName: newFile.name,
            category: newFile.category,
            size: newFile.size,
            sha256: sha256,
            uploadedBy: newFile.uploadedBy,
            ip: req.ip
        }, newFile.uploadedBy);
        
        await statsDB.update('upload', category);
        
        res.json({ success: true, data: newFile });
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
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
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
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Physical file not found' });
        }
        
        await filesDB.incrementDownload(req.params.id);
        
        await addLog('FILE_DOWNLOAD', {
            fileId: file.id,
            fileName: file.name,
            downloadCount: (file.downloadCount || 0) + 1,
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
// Helper Functions
// ============================================
function generateTitleId() {
    return '00040000' + Math.random().toString(16).substr(2, 8).toUpperCase();
}

function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

// ============================================
// Seed Management
// ============================================
const SEED_SOURCES = [
    'https://github.com/ihaveamac/3DS-rom-tools/raw/master/seeddb/seeddb.bin'
];

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

async function downloadSeedDB(url) {
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadSeedDB(res.headers.location).then(resolve).catch(reject);
            }
            
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function fetchAndCacheSeeds() {
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
// Seed API Routes
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
            downloadCount: (seed.downloadCount || 0) + 1,
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
        
        const buffer = fs.readFileSync(req.file.path);
        const newSeeds = parseSeedDB(buffer);
        
        if (newSeeds.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, error: 'Invalid seeddb.bin file' });
        }
        
        const added = await seedsDB.bulkInsert(newSeeds);
        fs.unlinkSync(req.file.path);
        
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
        const needsMigration = dbFiles.some(f => fs.existsSync(path.join(dbDir, f)));
        
        if (needsMigration) {
            console.log('Found JSON files, migrating to MariaDB...');
            await migrateFromJSON(DATA_DIR);
            
            // Rename JSON files to .bak after migration
            dbFiles.forEach(f => {
                const jsonPath = path.join(dbDir, f);
                if (fs.existsSync(jsonPath)) {
                    const bakPath = jsonPath + '.bak';
                    fs.renameSync(jsonPath, bakPath);
                    console.log(`Renamed ${f} to ${f}.bak`);
                }
            });
        }
        
        app.listen(PORT, () => {
            console.log(`
    ╔═══════════════════════════════════════════════╗
    ║         3DS eShop Clone Server                ║
    ║═══════════════════════════════════════════════║
    ║  Running on: http://localhost:${PORT}           ║
    ║  Admin Panel: http://localhost:${PORT}/admin.html║
    ║  Database: MariaDB                            ║
    ╚═══════════════════════════════════════════════╝
            `);
            
            addLog('SERVER_START', { port: PORT });
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
