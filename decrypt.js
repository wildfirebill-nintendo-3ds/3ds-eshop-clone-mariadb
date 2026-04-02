import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { dirname } from 'node:path';

// Paths
const TOOLS_DIR = path.join(__dirname, 'tools');
const STAGING_DIR = path.join(__dirname, 'data', 'staging');
const DECRYPTED_DIR = path.join(__dirname, 'data', 'decrypted');

// Tool paths
const TOOLS = {
    ctrtool: path.join(TOOLS_DIR, 'ctrtool.exe'),
    makerom: path.join(TOOLS_DIR, 'makerom.exe'),
    decrypt: path.join(TOOLS_DIR, 'decrypt.exe'),
    seeddb: path.join(TOOLS_DIR, 'seeddb.bin')
};

// Ensure directories exist
for (const dir of [STAGING_DIR, DECRYPTED_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ============================================
// Check if tools are installed
// ============================================
export async function checkTools() {
    const results = {};
    
    for (const [name, toolPath] of Object.entries(TOOLS)) {
        try {
            await fs.access(toolPath);
            results[name] = { installed: true, path: toolPath };
        } catch {
            results[name] = { installed: false, path: toolPath };
        }
    }
    
    return results;
}

// ============================================
// Detect file type (CIA or 3DS)
// ============================================
function detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.cia') return 'cia';
    if (ext === '.3ds') return '3ds';
    return 'unknown';
}

// ============================================
// Decrypt CIA file
// ============================================
async function decryptCIA(inputPath, outputDir, fileName) {
    const tempDir = path.join(outputDir, 'temp_' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
        const baseName = path.parse(fileName).name;
        const outputPath = path.join(outputDir, `${baseName}.cia`);
        
        // Step 1: Extract CIA content
        console.log(`[Decrypt] Extracting CIA: ${fileName}`);
        await execAsync(`"${TOOLS.ctrtool}" --contents="${tempDir}" "${inputPath}"`);
        
        // Step 2: Find the app file
        const files = await fs.readdir(tempDir);
        const appFile = files.find(f => f.endsWith('.app'));
        
        if (!appFile) {
            throw new Error('No .app file found in CIA');
        }
        
        const appPath = path.join(tempDir, appFile);
        
        // Step 3: Decrypt the app
        console.log(`[Decrypt] Decrypting content...`);
        await execAsync(`"${TOOLS.decrypt}" -in "${appPath}" -out "${path.join(tempDir, 'decrypted.app')}" -key0x2C`);
        
        // Step 4: Rebuild CIA
        console.log(`[Decrypt] Rebuilding CIA...`);
        await execAsync(`"${TOOLS.makerom}" -ciacd "${path.join(tempDir, 'decrypted.app')}" -o "${outputPath}"`);
        
        return outputPath;
    } finally {
        // Cleanup temp directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {}
    }
}

// ============================================
// Decrypt 3DS file
// ============================================
async function decrypt3DS(inputPath, outputDir, fileName) {
    const baseName = path.parse(fileName).name;
    const outputPath = path.join(outputDir, `${baseName}.3ds`);
    
    console.log(`[Decrypt] Decrypting 3DS: ${fileName}`);
    
    // Use ctrtool to decrypt and trim
    await execAsync(`"${TOOLS.ctrtool}" --trim --decrypt "${inputPath}" --output "${outputPath}"`);
    
    return outputPath;
}

// ============================================
// Main decrypt function
// ============================================
export async function decryptFile(inputPath, fileName, category) {
    const fileType = detectFileType(inputPath);
    
    if (fileType === 'unknown') {
        return {
            success: false,
            error: 'Unknown file type. Only CIA and 3DS files are supported.',
            path: null
        };
    }
    
    // Create output directory based on category
    const outputDir = path.join(DECRYPTED_DIR, category);
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    
    try {
        let decryptedPath;
        
        if (fileType === 'cia') {
            decryptedPath = await decryptCIA(inputPath, outputDir, fileName);
        } else {
            decryptedPath = await decrypt3DS(inputPath, outputDir, fileName);
        }
        
        // Verify output exists
        try {
            await fs.access(decryptedPath);
            const stats = await fs.stat(decryptedPath);
            
            return {
                success: true,
                path: decryptedPath,
                size: stats.size,
                originalSize: (await fs.stat(inputPath)).size
            };
        } catch {
            throw new Error('Decrypted file not found');
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            path: null
        };
    }
}

// ============================================
// Move file from staging to final location
// ============================================
export async function moveToFinal(stagingPath, finalDir, fileName) {
    const finalPath = path.join(finalDir, fileName);
    
    if (!existsSync(finalDir)) mkdirSync(finalDir, { recursive: true });
    
    await fs.copyFile(stagingPath, finalPath);
    await fs.unlink(stagingPath);
    
    return finalPath;
}

// ============================================
// Process uploaded file (staging -> decrypt -> final)
// ============================================
export async function processUpload(stagingPath, fileName, category) {
    const stagingStats = await fs.stat(stagingPath);
    
    return {
        stagingPath,
        fileName,
        category,
        size: stagingStats.size,
        status: 'staged'
    };
}

// ============================================
// Get staging files
// ============================================
export async function getStagingFiles() {
    const files = [];
    
    async function scanDir(dir, prefix = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                await scanDir(fullPath, path.join(prefix, entry.name));
            } else {
                const stats = await fs.stat(fullPath);
                files.push({
                    name: entry.name,
                    path: fullPath,
                    relativePath: path.join(prefix, entry.name),
                    size: stats.size,
                    modified: stats.mtime
                });
            }
        }
    }
    
    await scanDir(STAGING_DIR);
    return files;
}

// ============================================
// Clean old staging files (older than 24 hours)
// ============================================
export async function cleanStaging(maxAgeHours = 24) {
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;
    
    async function scanAndClean(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                await scanAndClean(fullPath);
            } else {
                const stats = await fs.stat(fullPath);
                if (now - stats.mtimeMs > maxAge) {
                    await fs.unlink(fullPath);
                    cleaned++;
                }
            }
        }
    }
    
    await scanAndClean(STAGING_DIR);
    return cleaned;
}

export { STAGING_DIR, DECRYPTED_DIR, TOOLS_DIR };
