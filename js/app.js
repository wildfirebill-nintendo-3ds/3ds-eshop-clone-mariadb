// 3DS eShop Clone - Main Application JavaScript

// ============================================
// Global State
// ============================================
const AppState = {
    games: [],
    dlc: [],
    apps: [],
    homebrew: [],
    virtualConsole: [],
    uploadedFiles: [],
    currentSection: 'home',
    gamesPage: 1,
    dlcPage: 1,
    appsPage: 1,
    vcPage: 1,
    itemsPerPage: 24,
    titleDbUrl: 'https://3dsdb.com/xml',
    currentFilter: 'all',
    currentUser: null,
    currentDownloadUrl: null,
    currentQrTitle: null
};

// ============================================
// Authentication System
// ============================================
const Auth = {
    // Default credentials (hashed for basic security)
    defaultUsername: 'admin',
    defaultPasswordHash: null, // Will be set during init
    
    // Simple hash function for password storage
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    },
    
    // Initialize authentication
    init() {
        this.defaultPasswordHash = this.hashPassword('admin123');
        
        // Load saved credentials
        const savedCredentials = localStorage.getItem('3dseshop_credentials');
        if (savedCredentials) {
            this.credentials = JSON.parse(savedCredentials);
        } else {
            this.credentials = {
                username: this.defaultUsername,
                passwordHash: this.defaultPasswordHash
            };
            this.saveCredentials();
        }
        
        // Check for existing session
        const session = localStorage.getItem('3dseshop_session');
        if (session) {
            const sessionData = JSON.parse(session);
            if (sessionData.expiry > Date.now()) {
                AppState.currentUser = sessionData.user;
            } else {
                localStorage.removeItem('3dseshop_session');
            }
        }
        
        this.updateUI();
    },
    
    // Save credentials
    saveCredentials() {
        localStorage.setItem('3dseshop_credentials', JSON.stringify(this.credentials));
    },
    
    // Login
    login(username, password, remember = false) {
        const passwordHash = this.hashPassword(password);
        
        if (username === this.credentials.username && passwordHash === this.credentials.passwordHash) {
            AppState.currentUser = { username, isAdmin: true };
            
            // Create session
            const sessionData = {
                user: AppState.currentUser,
                expiry: remember ? Date.now() + (30 * 24 * 60 * 60 * 1000) : Date.now() + (24 * 60 * 60 * 1000)
            };
            localStorage.setItem('3dseshop_session', JSON.stringify(sessionData));
            
            this.updateUI();
            return true;
        }
        return false;
    },
    
    // Logout
    logout() {
        AppState.currentUser = null;
        localStorage.removeItem('3dseshop_session');
        this.updateUI();
    },
    
    // Check if user is admin
    isAdmin() {
        return AppState.currentUser && AppState.currentUser.isAdmin;
    },
    
    // Change password
    changePassword(currentPassword, newPassword) {
        const currentHash = this.hashPassword(currentPassword);
        
        if (currentHash !== this.credentials.passwordHash) {
            return { success: false, message: 'Current password is incorrect' };
        }
        
        if (newPassword.length < 6) {
            return { success: false, message: 'New password must be at least 6 characters' };
        }
        
        this.credentials.passwordHash = this.hashPassword(newPassword);
        this.saveCredentials();
        
        return { success: true, message: 'Password changed successfully' };
    },
    
    // Update UI based on auth state
    updateUI() {
        const loginLogoutBtn = document.getElementById('loginLogoutBtn');
        const adminBadge = document.getElementById('adminBadge');
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        
        if (this.isAdmin()) {
            loginLogoutBtn.innerHTML = '<i class="bi bi-box-arrow-right"></i> Logout';
            loginLogoutBtn.removeAttribute('data-bs-toggle');
            loginLogoutBtn.removeAttribute('data-bs-target');
            loginLogoutBtn.onclick = () => {
                this.logout();
                showToast('Logged Out', 'You have been logged out');
                showSection(AppState.currentSection);
            };
            adminBadge.classList.remove('d-none');
            if (adminPanelBtn) adminPanelBtn.classList.remove('d-none');
        } else {
            loginLogoutBtn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Login';
            loginLogoutBtn.setAttribute('data-bs-toggle', 'modal');
            loginLogoutBtn.setAttribute('data-bs-target', '#loginModal');
            loginLogoutBtn.onclick = null;
            adminBadge.classList.add('d-none');
            if (adminPanelBtn) adminPanelBtn.classList.add('d-none');
        }
        
        // Update delete buttons visibility
        this.updateDeleteButtons();
    },
    
    // Update delete buttons visibility
    updateDeleteButtons() {
        const deleteButtons = document.querySelectorAll('.admin-only');
        deleteButtons.forEach(btn => {
            if (this.isAdmin()) {
                btn.classList.remove('d-none');
            } else {
                btn.classList.add('d-none');
            }
        });
    }
};

// ============================================
// TitleDB Data (Sample Data - Replace with actual API)
// ============================================
const sampleTitles = {
    games: [
        { titleId: '0004000000030100', productCode: 'CTR-P-ASME', name: 'Super Mario 3D Land', region: 'region-usa', size: '512MB', description: 'Mario can perform a rolling somersault attack and use a variety of power-ups.' },
        { titleId: '0004000000030800', productCode: 'CTR-P-AMKE', name: 'Mario Kart 7', region: 'region-usa', size: '768MB', description: 'Race with Mario and friends in exciting kart battles.' },
        { titleId: '0004000000055E00', productCode: 'CTR-P-AZLE', name: 'The Legend of Zelda: Ocarina of Time 3D', region: 'region-usa', size: '1GB', description: 'Classic adventure reborn on Nintendo 3DS.' },
        { titleId: '000400000008F800', productCode: 'CTR-P-EKJE', name: 'Pokemon X', region: 'region-usa', size: '1.7GB', description: 'A new generation of Pokemon begins.' },
        { titleId: '000400000005C100', productCode: 'CTR-P-ADAE', name: 'Animal Crossing: New Leaf', region: 'region-usa', size: '512MB', description: 'Create your perfect town and make it your own.' },
        { titleId: '00040000000EE000', productCode: 'CTR-P-AX4E', name: 'Super Smash Bros. for Nintendo 3DS', region: 'region-usa', size: '2GB', description: 'The biggest brawl is on Nintendo 3DS!' },
        { titleId: '000400000011C400', productCode: 'CTR-P-AFEE', name: 'Fire Emblem: Awakening', region: 'region-usa', size: '896MB', description: 'Lead your army to victory in tactical battles.' },
        { titleId: '00040000000A1E00', productCode: 'CTR-P-AMHE', name: 'Monster Hunter 4 Ultimate', region: 'region-usa', size: '2.5GB', description: 'Hunt monsters with friends in epic battles.' },
        { titleId: '0004000000132600', productCode: 'CTR-P-AQKE', name: 'Majoras Mask 3D', region: 'region-usa', size: '896MB', description: 'Save the world in 3 days.' },
        { titleId: '0004000000164500', productCode: 'CTR-P-ECRE', name: 'Pokemon Omega Ruby', region: 'region-usa', size: '1.8GB', description: 'Return to the Hoenn region.' },
        { titleId: '0004000000164800', productCode: 'CTR-P-ECSE', name: 'Pokemon Alpha Sapphire', region: 'region-usa', size: '1.8GB', description: 'Return to the Hoenn region.' },
        { titleId: '00040000001B5100', productCode: 'CTR-P-AYPE', name: 'Yo-kai Watch', region: 'region-usa', size: '1.2GB', description: 'Discover and befriend mysterious Yo-kai.' }
    ],
    dlc: [
        { titleId: '0004008C000A0100', productCode: 'CTR-P-AX4E', name: 'Smash Bros. Mewtwo DLC', region: 'region-usa', size: '32MB', description: 'Unlock Mewtwo as a playable character.' },
        { titleId: '0004008C000A0200', productCode: 'CTR-P-AX4E', name: 'Smash Bros. Ryu DLC', region: 'region-usa', size: '45MB', description: 'Unlock Ryu from Street Fighter.' },
        { titleId: '0004008C000B1500', productCode: 'CTR-P-AMHE', name: 'MH4U Additional Quests', region: 'region-usa', size: '128MB', description: 'Extra hunting quests and challenges.' },
        { titleId: '0004008C000C1300', productCode: 'CTR-P-AFEE', name: 'Fire Emblem DLC Pack 1', region: 'region-usa', size: '64MB', description: 'New maps and characters.' },
        { titleId: '0004008C000D3200', productCode: 'CTR-P-AZLE', name: 'Zelda DLC Bonus Dungeons', region: 'region-usa', size: '96MB', description: 'Additional dungeons to explore.' }
    ],
    apps: [
        { titleId: '0004001000020000', productCode: 'CTR-N-HESP', name: 'Nintendo eShop', region: 'region-global', size: '128MB', description: 'Official Nintendo eShop application.' },
        { titleId: '0004001000021000', productCode: 'CTR-N-HBRO', name: 'Internet Browser', region: 'region-global', size: '64MB', description: 'Browse the web on your 3DS.' },
        { titleId: '0004001000022000', productCode: 'CTR-N-HMIM', name: 'Mii Maker', region: 'region-global', size: '48MB', description: 'Create your own Mii characters.' },
        { titleId: '0004001000023000', productCode: 'CTR-N-HMSP', name: 'StreetPass Mii Plaza', region: 'region-global', size: '96MB', description: 'Meet other players via StreetPass.' },
        { titleId: '0004001000024000', productCode: 'CTR-N-HCAM', name: 'Nintendo 3DS Camera', region: 'region-global', size: '32MB', description: 'Take photos in 3D.' },
        { titleId: '0004001000025000', productCode: 'CTR-N-HSND', name: 'Nintendo 3DS Sound', region: 'region-global', size: '24MB', description: 'Listen to music on your 3DS.' }
    ],
    homebrew: [
        { titleId: 'HB001', name: 'Luma3DS', category: 'tools', region: 'region-global', size: '2MB', description: 'The most popular CFW for Nintendo 3DS.', url: 'https://github.com/LumaTeam/Luma3DS/releases/latest' },
        { titleId: 'HB002', name: 'FBI', category: 'tools', region: 'region-global', size: '1.5MB', description: 'Title manager and CIA installer for 3DS.', url: 'https://github.com/Steveice10/FBI/releases/latest' },
        { titleId: 'HB003', name: 'homebrew_launcher', category: 'utilities', region: 'region-global', size: '512KB', description: 'The Homebrew Launcher for 3DS.', url: 'https://github.com/smealum/3ds_homebrew_launcher/releases/latest' },
        { titleId: 'HB004', name: 'Checkpoint', category: 'utilities', region: 'region-global', size: '1MB', description: 'Save manager for 3DS and NDS games.', url: 'https://github.com/FlagBrew/Checkpoint/releases/latest' },
        { titleId: 'HB005', name: 'JKSM', category: 'utilities', region: 'region-global', size: '768KB', description: 'JK Save Manager for backing up saves.', url: 'https://github.com/J-D-K/JKSM/releases/latest' },
        { titleId: 'HB006', name: 'Citra', category: 'emulators', region: 'region-global', size: '64MB', description: '3DS emulator for PC (reference only).', url: 'https://github.com/citra-emu/citra/releases/latest' },
        { titleId: 'HB007', name: 'RetroArch', category: 'emulators', region: 'region-global', size: '128MB', description: 'Multi-system emulator frontend for 3DS.', url: 'https://buildbot.libretro.com/stable/' },
        { titleId: 'HB008', name: 'mGBA', category: 'emulators', region: 'region-global', size: '8MB', description: 'Game Boy Advance emulator for 3DS.', url: 'https://github.com/mgba-emu/mgba/releases/latest' },
        { titleId: 'HB009', name: 'PKSM', category: 'games', region: 'region-global', size: '4MB', description: 'Pokemon save manager and editor.', url: 'https://github.com/FlagBrew/PKSM/releases/latest' },
        { titleId: 'HB010', name: 'Anemone3DS', category: 'themes', region: 'region-global', size: '2MB', description: 'Custom theme manager for 3DS.', url: 'https://github.com/astronautlevel2/Anemone3DS/releases/latest' },
        { titleId: 'HB011', name: 'Universal-Updater', category: 'tools', region: 'region-global', size: '3MB', description: 'App store for homebrew on 3DS.', url: 'https://github.com/Universal-Team/Universal-Updater/releases/latest' },
        { titleId: 'HB012', name: 'GodMode9', category: 'tools', region: 'region-global', size: '1MB', description: 'Full access file browser for 3DS.', url: 'https://github.com/d0k3/GodMode9/releases/latest' },
        { titleId: 'HB013', name: 'TWiLight Menu++', category: 'emulators', region: 'region-global', size: '32MB', description: 'DS game loader for 3DS.', url: 'https://github.com/DS-Homebrew/TWiLightMenu/releases/latest' },
        { titleId: 'HB014', name: 'ftpd', category: 'utilities', region: 'region-global', size: '256KB', description: 'FTP server for 3DS file transfer.', url: 'https://github.com/mtheall/ftpd/releases/latest' },
        { titleId: 'HB015', name: '3ds_smashbroshax', category: 'games', region: 'region-global', size: '512KB', description: 'Homebrew exploit for Smash Bros.', url: 'https://github.com/yellows8/3ds_smashbroshax/releases/latest' }
    ],
    virtualConsole: [
        // NES
        { titleId: '0004000000030500', name: 'Super Mario Bros.', category: 'nes', region: 'region-usa', size: '2MB', description: 'The classic that started it all!' },
        { titleId: '0004000000030501', name: 'The Legend of Zelda', category: 'nes', region: 'region-usa', size: '2MB', description: 'Begin your adventure in Hyrule.' },
        { titleId: '0004000000030502', name: 'Metroid', category: 'nes', region: 'region-usa', size: '2MB', description: 'Explore Planet Zebes as Samus Aran.' },
        { titleId: '0004000000030503', name: 'Excitebike', category: 'nes', region: 'region-usa', size: '1MB', description: 'Classic motocross racing action.' },
        { titleId: '0004000000030504', name: 'Ice Climber', category: 'nes', region: 'region-usa', size: '1MB', description: 'Climb mountains and catch condors.' },
        { titleId: '0004000000030505', name: 'Donkey Kong', category: 'nes', region: 'region-usa', size: '1MB', description: 'Jump barrels and save Pauline!' },
        { titleId: '0004000000030506', name: 'Balloon Fight', category: 'nes', region: 'region-usa', size: '1MB', description: 'Pop balloons and defeat enemies.' },
        { titleId: '0004000000030507', name: 'Wrecking Crew', category: 'nes', region: 'region-usa', size: '1MB', description: 'Smash walls as Mario.' },
        // SNES
        { titleId: '0004000000030600', name: 'Super Mario World', category: 'snes', region: 'region-usa', size: '4MB', description: 'Mario and Yoshi save Dinosaur Land.' },
        { titleId: '0004000000030601', name: 'A Link to the Past', category: 'snes', region: 'region-usa', size: '4MB', description: 'Save Hyrule in this classic adventure.' },
        { titleId: '0004000000030602', name: 'Super Metroid', category: 'snes', region: 'region-usa', size: '4MB', description: 'Explore Zebes and defeat the Space Pirates.' },
        { titleId: '0004000000030603', name: 'F-Zero', category: 'snes', region: 'region-usa', size: '3MB', description: 'High-speed futuristic racing.' },
        { titleId: '0004000000030604', name: 'Super Mario Kart', category: 'snes', region: 'region-usa', size: '3MB', description: 'The original kart racing game!' },
        { titleId: '0004000000030605', name: 'Earthbound', category: 'snes', region: 'region-usa', size: '4MB', description: 'Quirky RPG adventure.' },
        { titleId: '0004000000030606', name: 'Donkey Kong Country', category: 'snes', region: 'region-usa', size: '5MB', description: 'Platforming with DK and Diddy.' },
        // Game Boy
        { titleId: '0004000000030700', name: 'Super Mario Land', category: 'gb', region: 'region-usa', size: '1MB', description: 'Mario adventures on Game Boy.' },
        { titleId: '0004000000030701', name: 'Links Awakening', category: 'gb', region: 'region-usa', size: '1MB', description: 'Link awakens on a mysterious island.' },
        { titleId: '0004000000030702', name: 'Tetris', category: 'gb', region: 'region-usa', size: '512KB', description: 'The legendary puzzle game.' },
        { titleId: '0004000000030703', name: 'Metroid II', category: 'gb', region: 'region-usa', size: '1MB', description: 'Hunt Metroids on SR388.' },
        { titleId: '0004000000030704', name: 'Kirbys Dream Land', category: 'gb', region: 'region-usa', size: '512KB', description: 'Kirbys first adventure!' },
        { titleId: '0004000000030705', name: 'Pokemon Red', category: 'gb', region: 'region-usa', size: '1MB', description: 'Gotta catch em all!' },
        { titleId: '0004000000030706', name: 'Pokemon Blue', category: 'gb', region: 'region-usa', size: '1MB', description: 'Gotta catch em all!' },
        // Game Boy Color
        { titleId: '0004000000030800', name: 'Pokemon Gold', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Explore Johto region.' },
        { titleId: '0004000000030801', name: 'Pokemon Silver', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Explore Johto region.' },
        { titleId: '0004000000030802', name: 'Links Awakening DX', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Color enhanced classic.' },
        { titleId: '0004000000030803', name: 'Wario Land 3', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Warios platforming adventure.' },
        { titleId: '0004000000030804', name: 'Super Mario Bros Deluxe', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Classic Mario in color!' },
        { titleId: '0004000000030805', name: 'Zelda Oracle of Ages', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Time-traveling Zelda adventure.' },
        { titleId: '0004000000030806', name: 'Zelda Oracle of Seasons', category: 'gbc', region: 'region-usa', size: '1MB', description: 'Season-changing Zelda adventure.' },
        // GBA
        { titleId: '0004000000030900', name: 'Super Mario Advance', category: 'gba', region: 'region-usa', size: '4MB', description: 'Super Mario Bros 2 remade.' },
        { titleId: '0004000000030901', name: 'Mario Kart Super Circuit', category: 'gba', region: 'region-usa', size: '4MB', description: 'Portable kart racing.' },
        { titleId: '0004000000030902', name: 'Metroid Fusion', category: 'gba', region: 'region-usa', size: '4MB', description: 'Samus faces the X parasite.' },
        { titleId: '0004000000030903', name: 'Metroid Zero Mission', category: 'gba', region: 'region-usa', size: '4MB', description: 'Remake of the original Metroid.' },
        { titleId: '0004000000030904', name: 'Pokemon Ruby', category: 'gba', region: 'region-usa', size: '4MB', description: 'Begin your Hoenn adventure.' },
        { titleId: '0004000000030905', name: 'Pokemon Sapphire', category: 'gba', region: 'region-usa', size: '4MB', description: 'Begin your Hoenn adventure.' },
        { titleId: '0004000000030906', name: 'Pokemon Emerald', category: 'gba', region: 'region-usa', size: '4MB', description: 'The definitive Hoenn experience.' },
        { titleId: '0004000000030907', name: 'Fire Emblem', category: 'gba', region: 'region-usa', size: '4MB', description: 'Tactical RPG excellence.' },
        { titleId: '0004000000030908', name: 'Kirby Nightmare in Dreamland', category: 'gba', region: 'region-usa', size: '4MB', description: 'Kirby platforming action.' },
        { titleId: '0004000000030909', name: 'F-Zero Maximum Velocity', category: 'gba', region: 'region-usa', size: '3MB', description: 'Fast-paced GBA racing.' },
        // N64
        { titleId: '0004000000031000', name: 'Super Mario 64', category: 'n64', region: 'region-usa', size: '8MB', description: 'Marios first 3D adventure!' },
        { titleId: '0004000000031001', name: 'Ocarina of Time', category: 'n64', region: 'region-usa', size: '8MB', description: 'Timeless 3D Zelda classic.' },
        { titleId: '0004000000031002', name: 'Majoras Mask', category: 'n64', region: 'region-usa', size: '8MB', description: 'Save Termina in 3 days.' },
        { titleId: '0004000000031003', name: 'Star Fox 64', category: 'n64', region: 'region-usa', size: '6MB', description: 'Do a barrel roll!' },
        { titleId: '0004000000031004', name: 'Mario Kart 64', category: 'n64', region: 'region-usa', size: '6MB', description: 'Classic 4-player kart action.' },
        { titleId: '0004000000031005', name: 'Paper Mario', category: 'n64', region: 'region-usa', size: '8MB', description: 'Paper-thin RPG adventure.' },
        // Genesis
        { titleId: '0004000000031100', name: 'Sonic the Hedgehog', category: 'genesis', region: 'region-usa', size: '2MB', description: 'Gotta go fast!' },
        { titleId: '0004000000031101', name: 'Sonic the Hedgehog 2', category: 'genesis', region: 'region-usa', size: '2MB', description: 'Sonic and Tails unite!' },
        { titleId: '0004000000031102', name: 'Streets of Rage 2', category: 'genesis', region: 'region-usa', size: '3MB', description: 'Beat-em-up action.' },
        { titleId: '0004000000031103', name: 'Ecco the Dolphin', category: 'genesis', region: 'region-usa', size: '2MB', description: 'Dolphin adventure.' },
        { titleId: '0004000000031104', name: 'Gunstar Heroes', category: 'genesis', region: 'region-usa', size: '2MB', description: 'Run and gun action.' },
        { titleId: '0004000000031105', name: 'Shining Force', category: 'genesis', region: 'region-usa', size: '3MB', description: 'Tactical RPG classic.' },
        { titleId: '0004000000031106', name: 'Phantasy Star IV', category: 'genesis', region: 'region-usa', size: '4MB', description: 'Epic sci-fi RPG.' }
    ]
};

// ============================================
// 3DS Hacks Guide Content
// ============================================
const guideContent = {
    'getting-started': `
        <h3>Getting Started with 3DS Hacking</h3>
        <div class="alert alert-warning">
            <i class="bi bi-exclamation-triangle"></i> 
            <strong>Important:</strong> Always follow the guide carefully and make backups.
        </div>
        <h4>Before You Begin</h4>
        <div class="step">
            <strong>1. Check your firmware version</strong><br>
            Go to System Settings → Other Settings → System Update to see your current version.
        </div>
        <div class="step">
            <strong>2. Identify your 3DS model</strong><br>
            Old 3DS/2DS (o3DS/o2DS) or New 3DS/2DS (n3DS/n2DS)
        </div>
        <div class="step">
            <strong>3. Backup your SD card</strong><br>
            Copy all contents to a safe location on your computer.
        </div>
        <h4>Required Items</h4>
        <ul>
            <li>Nintendo 3DS/2DS/3DS XL console</li>
            <li>SD card (4GB minimum, 32GB+ recommended)</li>
            <li>Computer with SD card reader</li>
            <li>Stable internet connection</li>
        </ul>
        <p>For detailed instructions, visit <a href="https://3ds.hacks.guide" target="_blank">3ds.hacks.guide</a></p>
    `,
    'cfw-guide': `
        <h3>Installing Custom Firmware (CFW)</h3>
        <div class="alert alert-danger">
            <i class="bi bi-shield-exclamation"></i>
            <strong>Warning:</strong> Incorrectly following these steps can brick your console.
        </div>
        <h4>What is CFW?</h4>
        <p>Custom Firmware (CFW) allows you to run homebrew software, backup games, and customize your 3DS experience.</p>
        
        <h4>Popular CFW Options</h4>
        <div class="step">
            <strong>Luma3DS (Recommended)</strong><br>
            The most popular and well-maintained CFW. Supports all 3DS models and firmware versions.
        </div>
        
        <h4>Installation Steps</h4>
        <div class="step">
            <strong>Step 1: Choose your exploit</strong><br>
            Based on your firmware version, select the appropriate entry point:
            <ul>
                <li>Seedminer (11.14.0-11.17.0)</li>
                <li>super-skaterhax (11.15.0-11.17.0 on N3DS)</li>
                <li>menuhax (older firmware)</li>
            </ul>
        </div>
        <div class="step">
            <strong>Step 2: Download required files</strong><br>
            Download Luma3DS, GodMode9, and other required files from their official releases.
        </div>
        <div class="step">
            <strong>Step 3: Copy files to SD card</strong><br>
            Extract and copy the files to the root of your SD card.
        </div>
        <div class="step">
            <strong>Step 4: Run the exploit</strong><br>
            Follow the specific instructions for your chosen exploit method.
        </div>
        <div class="step">
            <strong>Step 5: Configure Luma3DS</strong><br>
            Select the options you want enabled in the Luma3DS configuration menu.
        </div>
        <p class="mt-3">
            <strong>Full guide:</strong> 
            <a href="https://3ds.hacks.guide/get-started" target="_blank">https://3ds.hacks.guide/get-started</a>
        </p>
    `,
    'fbi-usage': `
        <h3>Using FBI for Installing Software</h3>
        <p>FBI is the primary tool for installing CIA files on your 3DS.</p>
        
        <h4>What is FBI?</h4>
        <p>FBI is a title manager and CIA installer that allows you to install games, apps, and homebrew from CIA files.</p>
        
        <h4>Installing CIA Files</h4>
        <div class="step">
            <strong>Method 1: SD Card Installation</strong><br>
            1. Copy CIA files to your SD card<br>
            2. Open FBI<br>
            3. Navigate to the CIA file<br>
            4. Select "Install and delete CIA"
        </div>
        
        <div class="step">
            <strong>Method 2: QR Code Installation</strong><br>
            1. Open FBI<br>
            2. Go to "Remote Install"<br>
            3. Select "Scan QR Code"<br>
            4. Point camera at the QR code from this site!
        </div>
        
        <div class="step">
            <strong>Method 3: Network Installation</strong><br>
            1. Open FBI<br>
            2. Go to "Remote Install"<br>
            3. Select "Receive from URL"<br>
            4. Enter the direct download link from this site
        </div>
        
        <h4>Tips</h4>
        <ul>
            <li>Always verify the Title ID before installing</li>
            <li>Make sure you have enough free space on your SD card</li>
            <li>CIA files will be deleted after installation if you choose "Install and delete"</li>
        </ul>
        
        <p><strong>Download FBI:</strong> <a href="https://github.com/Steveice10/FBI/releases" target="_blank">GitHub Releases</a></p>
    `,
    'faq': `
        <h3>Frequently Asked Questions</h3>
        
        <h4>Is hacking my 3DS illegal?</h4>
        <p>Hacking your console is not illegal, but downloading copyrighted games you don't own is piracy.</p>
        
        <h4>Can I still use the eShop after hacking?</h4>
        <p>Yes, CFW does not prevent you from using the eShop or online features.</p>
        
        <h4>Will I get banned?</h4>
        <p>The risk is low if you follow best practices:
        <ul>
            <li>Don't cheat online</li>
            <li>Don't play games before their release date</li>
            <li>Don't use obvious hacks in online games</li>
        </ul></p>
        
        <h4>What is a CIA file?</h4>
        <p>CIA (CTR Importable Archive) is the file format used to install software on 3DS.</p>
        
        <h4>What is a Title ID?</h4>
        <p>A Title ID is a unique identifier for each piece of software on the 3DS.</p>
        
        <h4>How do I update my CFW?</h4>
        <p>Simply replace the Luma3DS files on your SD card with the new version.</p>
        
        <h4>Can I undo the hack?</h4>
        <p>Yes, it's possible to remove CFW, but you should follow a specific guide for this.</p>
        
        <h4>What format should my SD card be?</h4>
        <p>SD cards 32GB and smaller should be FAT32. Larger cards should also be formatted as FAT32.</p>
    `
};

// ============================================
// Dark Mode
// ============================================
function initDarkMode() {
    const darkModeEnabled = localStorage.getItem('3dseshop_darkMode') === 'true';
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
        updateDarkModeIcon(true);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('3dseshop_darkMode', isDark);
    updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
    const icon = document.getElementById('darkModeIcon');
    if (icon) {
        icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
    }
}

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    Auth.init(); // Initialize authentication
    initDarkMode(); // Initialize dark mode
    loadUploadedFiles();
    loadTitleDb();
    setupEventListeners();
    showSection('home');
    loadGuideContent('getting-started');
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.dataset.section;
            showSection(section);
            updateActiveNav(e.currentTarget);
        });
    });

    // Search Form
    document.getElementById('searchForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            performSearch(query);
        }
    });

    // Upload Form
    document.getElementById('uploadForm').addEventListener('submit', handleFileUpload);

    // Category Change in Upload Form
    document.getElementById('titleCategory').addEventListener('change', (e) => {
        const homebrewDiv = document.getElementById('homebrewCategoryDiv');
        const vcDiv = document.getElementById('virtualConsoleCategoryDiv');
        homebrewDiv.style.display = e.target.value === 'homebrew' ? 'block' : 'none';
        vcDiv.style.display = e.target.value === 'virtual-console' ? 'block' : 'none';
    });

    // Homebrew Categories
    document.querySelectorAll('[data-category]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('[data-category]').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            filterHomebrew(e.currentTarget.dataset.category);
        });
    });

    // Virtual Console Filters
    document.querySelectorAll('[data-vc-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-vc-filter]').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderVirtualConsole(e.currentTarget.dataset.vcFilter);
        });
    });

    // Guide Navigation
    document.querySelectorAll('[data-guide]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('[data-guide]').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            loadGuideContent(e.currentTarget.dataset.guide);
        });
    });

    // Region Filters
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            filterByRegion(e.currentTarget.dataset.filter);
        });
    });

    // Load More Buttons
    document.getElementById('loadMoreGames')?.addEventListener('click', () => loadMore('games'));
    document.getElementById('loadMoreDlc')?.addEventListener('click', () => loadMore('dlc'));
    document.getElementById('loadMoreApps')?.addEventListener('click', () => loadMore('apps'));
    document.getElementById('loadMoreVirtualConsole')?.addEventListener('click', () => loadMore('virtual-console'));

    // QR Modal Buttons
    document.getElementById('downloadQrBtn')?.addEventListener('click', downloadQrCode);
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyDirectLink);

    // Dark Mode Toggle
    document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);

    // Login Form
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    
    // Toggle Password Visibility
    document.getElementById('togglePassword')?.addEventListener('click', () => {
        const passwordInput = document.getElementById('loginPassword');
        const icon = document.querySelector('#togglePassword i');
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.replace('bi-eye', 'bi-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.replace('bi-eye-slash', 'bi-eye');
        }
    });
    
    // Change Password Form
    document.getElementById('changePasswordForm')?.addEventListener('submit', handleChangePassword);
}

// ============================================
// Section Management
// ============================================
function showSection(sectionName) {
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.add('d-none');
    });
    const section = document.getElementById(`${sectionName}-section`);
    if (section) {
        section.classList.remove('d-none');
        AppState.currentSection = sectionName;
    }

    if (sectionName === 'games' && AppState.games.length === 0) {
        renderGames();
    } else if (sectionName === 'dlc' && AppState.dlc.length === 0) {
        renderDlc();
    } else if (sectionName === 'apps' && AppState.apps.length === 0) {
        renderApps();
    } else if (sectionName === 'virtual-console') {
        renderVirtualConsole();
    } else if (sectionName === 'homebrew') {
        renderHomebrew();
    } else if (sectionName === 'seeds') {
        loadSeeds();
    } else if (sectionName === 'home') {
        renderFeaturedGames();
        renderRecentHomebrew();
    } else if (sectionName === 'upload') {
        renderUploadedFiles();
    }
    
    // Update admin controls visibility
    Auth.updateDeleteButtons();
}

function updateActiveNav(activeLink) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    activeLink.classList.add('active');
}

// ============================================
// Data Loading
// ============================================
async function loadTitleDb() {
    showLoading(true);
    try {
        // Load sample data
        AppState.games = [...sampleTitles.games];
        AppState.dlc = [...sampleTitles.dlc];
        AppState.apps = [...sampleTitles.apps];
        AppState.homebrew = [...sampleTitles.homebrew];
        AppState.virtualConsole = [...sampleTitles.virtualConsole];

        // Try to fetch from actual titledb (if CORS allows)
        try {
            const response = await fetch('https://raw.githubusercontent.com/ihaveamac/3dsdb/master/xml/3dsreleases.xml');
            if (response.ok) {
                const xmlText = await response.text();
                parseTitleDbXml(xmlText);
            }
        } catch (e) {
            console.log('Using sample data - titledb fetch failed');
        }

        renderFeaturedGames();
        renderRecentHomebrew();
    } catch (error) {
        console.error('Error loading titledb:', error);
        showToast('Error', 'Failed to load title database');
    } finally {
        showLoading(false);
    }
}

function parseTitleDbXml(xmlText) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const releases = xmlDoc.querySelectorAll('release');
        
        releases.forEach(release => {
            const name = release.querySelector('name')?.textContent || 'Unknown';
            const titleId = release.querySelector('titleid')?.textContent || '';
            const region = release.querySelector('region')?.textContent || 'global';
            const type = release.querySelector('type')?.textContent || 'game';
            
            const title = {
                titleId: titleId,
                name: name,
                region: `region-${region.toLowerCase()}`,
                size: 'Unknown',
                description: `${name} for Nintendo 3DS`
            };

            if (type.toLowerCase().includes('dlc')) {
                AppState.dlc.push(title);
            } else if (type.toLowerCase().includes('app')) {
                AppState.apps.push(title);
            } else {
                AppState.games.push(title);
            }
        });
    } catch (e) {
        console.error('Error parsing XML:', e);
    }
}

// ============================================
// Rendering Functions
// ============================================
function renderFeaturedGames() {
    const container = document.getElementById('featuredGames');
    if (!container) return;

    const featured = AppState.games.slice(0, 6);
    container.innerHTML = featured.map(game => createTitleCard(game, 'game')).join('');
}

function renderRecentHomebrew() {
    const container = document.getElementById('recentHomebrew');
    if (!container) return;

    const recent = AppState.homebrew.slice(0, 6);
    container.innerHTML = recent.map(hb => createTitleCard(hb, 'homebrew')).join('');
}

function renderGames() {
    const container = document.getElementById('gamesGrid');
    if (!container) return;

    const gamesToShow = AppState.games.slice(0, AppState.gamesPage * AppState.itemsPerPage);
    container.innerHTML = gamesToShow.map(game => createTitleCard(game, 'game')).join('');
}

function renderDlc() {
    const container = document.getElementById('dlcGrid');
    if (!container) return;

    const dlcToShow = AppState.dlc.slice(0, AppState.dlcPage * AppState.itemsPerPage);
    container.innerHTML = dlcToShow.map(d => createTitleCard(d, 'dlc')).join('');
}

function renderApps() {
    const container = document.getElementById('appsGrid');
    if (!container) return;

    const appsToShow = AppState.apps.slice(0, AppState.appsPage * AppState.itemsPerPage);
    container.innerHTML = appsToShow.map(app => createTitleCard(app, 'app')).join('');
}

function renderVirtualConsole(category = 'all') {
    const container = document.getElementById('virtualConsoleGrid');
    if (!container) return;

    let vcToShow = AppState.virtualConsole;
    if (category !== 'all') {
        vcToShow = AppState.virtualConsole.filter(vc => vc.category === category);
    }

    if (vcToShow.length === 0) {
        container.innerHTML = `
            <div class="col-12 empty-state">
                <i class="bi bi-inbox"></i>
                <p>No Virtual Console games found in this category</p>
            </div>
        `;
    } else {
        container.innerHTML = vcToShow.map(vc => createTitleCard(vc, 'virtual-console')).join('');
    }
}

function renderHomebrew(category = 'all') {
    const container = document.getElementById('homebrewGrid');
    if (!container) return;

    let homebrewToShow = AppState.homebrew;
    if (category !== 'all') {
        homebrewToShow = AppState.homebrew.filter(hb => hb.category === category);
    }

    if (homebrewToShow.length === 0) {
        container.innerHTML = `
            <div class="col-12 empty-state">
                <i class="bi bi-inbox"></i>
                <p>No homebrew found in this category</p>
            </div>
        `;
    } else {
        container.innerHTML = homebrewToShow.map(hb => createTitleCard(hb, 'homebrew')).join('');
    }
}

function renderUploadedFiles() {
    const container = document.getElementById('uploadedFilesBody');
    if (!container) return;

    const isAdmin = Auth.isAdmin();

    if (AppState.uploadedFiles.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4">
                    <i class="bi bi-inbox fs-1 text-muted"></i>
                    <p class="text-muted mb-0">No files uploaded yet</p>
                </td>
            </tr>
        `;
    } else {
        container.innerHTML = AppState.uploadedFiles.map(file => `
            <tr>
                <td>
                    <img src="${file.icon || getIconUrl(file) || getPlaceholderIcon(file.name, '#667eea')}" 
                         alt="${file.name}" width="40" height="40" class="rounded"
                         onerror="this.src='${getPlaceholderIcon(file.name, '#667eea')}'">
                </td>
                <td><strong>${file.name}</strong></td>
                <td><span class="badge badge-${file.category}">${file.category}</span></td>
                <td>${file.uploadedBy || 'Anonymous'}</td>
                <td><span class="badge bg-success">${file.downloadCount || 0}</span></td>
                <td>
                    <code class="small" style="font-size: 0.7rem;" title="${file.sha256 || 'N/A'}">
                        ${file.sha256 ? file.sha256.substring(0, 12) + '...' : 'N/A'}
                    </code>
                </td>
                <td class="file-size">${formatSizeWithBlocks(file.size)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="showQrCode('${file.id}')" title="Show QR Code">
                            <i class="bi bi-qr-code"></i>
                        </button>
                        <button class="btn btn-outline-success" onclick="downloadFile('${file.id}')" title="Download">
                            <i class="bi bi-download"></i>
                        </button>
                        ${isAdmin ? `
                        <button class="btn btn-outline-danger admin-only" onclick="deleteFile('${file.id}')" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// ============================================
// Card Creation
// ============================================

// Get 3DS icon URL from GitHub repository
const ICON_BASE_URL = 'https://raw.githubusercontent.com/wildfirebill-nintendo-3ds/3dsgamesicons/d73aa93996362bf6cdc33c985a23ab7133fe6328/icons/title_ids';

function getIconUrl(title) {
    // If title already has a custom icon, use it
    if (title.icon && title.icon.startsWith('http')) {
        return title.icon;
    }
    if (title.icon && title.icon.startsWith('data:')) {
        return title.icon;
    }
    
    // Try to get from GitHub icon repository using title ID
    if (title.titleId && title.titleId.length === 16) {
        const titleIdLower = title.titleId.toLowerCase();
        return `${ICON_BASE_URL}/${titleIdLower}.png`;
    }
    
    return null;
}

// Generate placeholder icon SVG
function getPlaceholderIcon(name, color) {
    const letter = name ? name.charAt(0).toUpperCase() : '?';
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="${encodeURIComponent(color)}" width="100" height="100" rx="10"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="40" font-family="Arial">${letter}</text></svg>`;
}

function createTitleCard(title, category) {
    const regionBadge = getRegionBadge(title.region);
    const categoryBadge = getCategoryBadge(category);
    const iconColors = [
        '#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#a8edea', '#ff6b6b', '#4ecdc4'
    ];
    const iconColor = iconColors[Math.abs(hashCode(title.name)) % iconColors.length];
    const iconUrl = getIconUrl(title);
    const placeholderIcon = getPlaceholderIcon(title.name, iconColor);

    return `
        <div class="col">
            <div class="title-card position-relative" onclick="showTitleDetails('${title.titleId}', '${category}')">
                <div class="card-img-top icon-placeholder" style="background: ${iconColor}">
                    <img src="${iconUrl || placeholderIcon}" 
                         alt="${title.name}" 
                         class="w-100 h-100" 
                         style="object-fit: cover;"
                         onerror="this.src='${placeholderIcon}'">
                    ${regionBadge}
                    <span class="qr-badge"><i class="bi bi-qr-code"></i> QR</span>
                </div>
                <div class="card-body">
                    <h6 class="card-title" title="${title.name}">${title.name}</h6>
                    <p class="card-text">${categoryBadge} ${title.size || 'Unknown size'}</p>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); showQrCode('${title.titleId}')">
                        <i class="bi bi-qr-code"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function getRegionBadge(region) {
    const badges = {
        'region-usa': '<span class="badge badge-usa badge-region">USA</span>',
        'region-eur': '<span class="badge badge-eur badge-region">EUR</span>',
        'region-jpn': '<span class="badge badge-jpn badge-region">JPN</span>',
        'region-global': '<span class="badge badge-global badge-region">GLOBAL</span>'
    };
    return badges[region] || '<span class="badge bg-secondary badge-region">?</span>';
}

function getCategoryBadge(category) {
    const badges = {
        'game': '<span class="badge badge-game">Game</span>',
        'dlc': '<span class="badge badge-dlc">DLC</span>',
        'app': '<span class="badge badge-app">App</span>',
        'virtual-console': '<span class="badge badge-virtual-console">VC</span>',
        'homebrew': '<span class="badge badge-homebrew">Homebrew</span>'
    };
    
    // VC subcategories
    const vcBadges = {
        'nes': '<span class="badge badge-virtual-console">NES</span>',
        'snes': '<span class="badge badge-virtual-console">SNES</span>',
        'gb': '<span class="badge badge-virtual-console">GB</span>',
        'gbc': '<span class="badge badge-virtual-console">GBC</span>',
        'gba': '<span class="badge badge-virtual-console">GBA</span>',
        'n64': '<span class="badge badge-virtual-console">N64</span>',
        'genesis': '<span class="badge badge-virtual-console">Genesis</span>',
        'gamegear': '<span class="badge badge-virtual-console">GG</span>',
        'turbografx': '<span class="badge badge-virtual-console">TG16</span>'
    };
    
    return badges[category] || vcBadges[category] || '';
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// ============================================
// QR Code Generation
// ============================================
function showQrCode(identifier) {
    const modal = new bootstrap.Modal(document.getElementById('qrModal'));
    const container = document.getElementById('qrCodeContainer');
    const titleName = document.getElementById('qrTitleName');
    const titleId = document.getElementById('qrTitleId');

    // Find the title
    let title = findTitleById(identifier);
    if (!title) {
        // Check uploaded files
        title = AppState.uploadedFiles.find(f => f.id === identifier || f.titleId === identifier);
    }

    if (!title) {
        title = { name: 'Unknown Title', titleId: identifier };
    }

    // Generate download URL
    const downloadUrl = generateDownloadUrl(title);
    
    // Clear previous QR code
    container.innerHTML = '';
    
    // Generate QR code
    QRCode.toCanvas(downloadUrl, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }, (error, canvas) => {
        if (error) {
            console.error(error);
            container.innerHTML = '<p class="text-danger">Error generating QR code</p>';
            return;
        }
        container.appendChild(canvas);
    });

    titleName.textContent = title.name;
    titleId.textContent = `Title ID: ${title.titleId || 'N/A'}`;

    // Store current download URL for copy button
    AppState.currentDownloadUrl = downloadUrl;
    AppState.currentQrTitle = title;

    modal.show();
}

function generateDownloadUrl(title) {
    // If it's an uploaded file with filePath, use data folder structure
    if (title.filePath) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/${title.filePath}`;
    }
    
    // If it's an uploaded file, use blob URL
    if (title.fileUrl) {
        return title.fileUrl;
    }
    
    // For homebrew with external URL, use GitHub releases URL
    if (title.url) {
        return title.url;
    }
    
    // Generate URL using data folder structure
    const baseUrl = window.location.origin;
    const categoryPath = getDataPath(title.category || 'homebrew');
    const fileName = encodeURIComponent(title.name) + '.cia';
    return `${baseUrl}/${categoryPath}${fileName}`;
}

function downloadQrCode() {
    const canvas = document.querySelector('#qrCodeContainer canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `qr-${AppState.currentQrTitle?.titleId || 'code'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function copyDirectLink() {
    if (AppState.currentDownloadUrl) {
        navigator.clipboard.writeText(AppState.currentDownloadUrl).then(() => {
            showToast('Copied!', 'Download link copied to clipboard');
        }).catch(() => {
            showToast('Error', 'Failed to copy link');
        });
    }
}

// ============================================
// Title Details
// ============================================
function showTitleDetails(titleId, category) {
    const modal = new bootstrap.Modal(document.getElementById('titleModal'));
    const title = findTitleById(titleId) || AppState.uploadedFiles.find(f => f.titleId === titleId);

    if (!title) {
        showToast('Error', 'Title not found');
        return;
    }

    document.getElementById('modalTitleName').textContent = title.name;
    document.getElementById('modalTitleId').textContent = title.titleId || 'N/A';
    document.getElementById('modalProductCode').textContent = title.productCode || 'N/A';
    document.getElementById('modalCategory').textContent = category.charAt(0).toUpperCase() + category.slice(1);
    document.getElementById('modalRegion').textContent = (title.region || 'global').replace('region-', '').toUpperCase();
    document.getElementById('modalSize').textContent = typeof title.size === 'number' ? formatSizeWithBlocks(title.size) : (title.size || 'Unknown');
    document.getElementById('modalDescription').textContent = title.description || 'No description available.';
    document.getElementById('modalDownloads').textContent = title.downloadCount || 0;
    document.getElementById('modalUploadedBy').textContent = title.uploadedBy || 'N/A';
    document.getElementById('modalSha256').textContent = title.sha256 || 'N/A';
    
    const iconImg = document.getElementById('modalTitleIcon');
    const iconColors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];
    const iconColor = iconColors[Math.abs(hashCode(title.name)) % iconColors.length];
    iconImg.src = getIconUrl(title) || getPlaceholderIcon(title.name, iconColor);
    iconImg.onerror = function() { this.src = getPlaceholderIcon(title.name, iconColor); };

    // Show/hide seed button based on whether seed exists
    const seedBtn = document.getElementById('modalSeedBtn');
    seedBtn.classList.remove('d-none');
    seedBtn.onclick = () => {
        bootstrap.Modal.getInstance(document.getElementById('titleModal'))?.hide();
        setTimeout(() => showSeedQr(titleId), 300);
    };

    // Set up buttons
    document.getElementById('modalDownloadBtn').onclick = () => {
        if (title.fileUrl) {
            window.open(title.fileUrl, '_blank');
        } else if (title.titleId) {
            window.open(`/api/download/${title.id || title.titleId}`, '_blank');
        } else {
            showToast('Info', 'Download link not available');
        }
    };

    document.getElementById('modalQrBtn').onclick = () => {
        bootstrap.Modal.getInstance(document.getElementById('titleModal'))?.hide();
        setTimeout(() => showQrCode(titleId), 300);
    };

    modal.show();
}

function findTitleById(titleId) {
    return AppState.games.find(g => g.titleId === titleId) ||
           AppState.dlc.find(d => d.titleId === titleId) ||
           AppState.apps.find(a => a.titleId === titleId) ||
           AppState.homebrew.find(h => h.titleId === titleId);
}

// ============================================
// Authentication Handlers
// ============================================
function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe').checked;
    const errorDiv = document.getElementById('loginError');
    
    // Clear previous error
    errorDiv.classList.add('d-none');
    
    if (Auth.login(username, password, remember)) {
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        modal.hide();
        
        // Reset form
        document.getElementById('loginForm').reset();
        
        showToast('Welcome!', `Logged in as ${username}`);
        
        // Refresh current section to show admin controls
        showSection(AppState.currentSection);
    } else {
        errorDiv.textContent = 'Invalid username or password';
        errorDiv.classList.remove('d-none');
    }
}

function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('passwordError');
    
    // Clear previous error
    errorDiv.classList.add('d-none');
    
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    const result = Auth.changePassword(currentPassword, newPassword);
    
    if (result.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
        modal.hide();
        
        document.getElementById('changePasswordForm').reset();
        showToast('Success', result.message);
    } else {
        errorDiv.textContent = result.message;
        errorDiv.classList.remove('d-none');
    }
}

// ============================================
// File Upload Management
// ============================================

// Get data folder path based on category
function getDataPath(category) {
    const paths = {
        'game': 'data/games/',
        'dlc': 'data/dlc/',
        'app': 'data/apps/',
        'virtual-console': 'data/virtual-console/',
        'homebrew': 'data/homebrew/'
    };
    return paths[category] || 'data/uploads/';
}

// Get homebrew subfolder path
function getHomebrewSubfolder(subcategory) {
    const paths = {
        'emulators': 'emulators/',
        'utilities': 'utilities/',
        'games': 'games/',
        'themes': 'themes/',
        'tools': 'tools/'
    };
    return paths[subcategory] || 'other/';
}

// Get Virtual Console subfolder path
function getVirtualConsoleSubfolder(subcategory) {
    const paths = {
        'nes': 'nes/',
        'snes': 'snes/',
        'gb': 'gb/',
        'gbc': 'gbc/',
        'gba': 'gba/',
        'n64': 'n64/',
        'genesis': 'genesis/',
        'gamegear': 'gamegear/',
        'turbografx': 'turbografx/'
    };
    return paths[subcategory] || 'other/';
}

async function handleFileUpload(e) {
    e.preventDefault();
    showLoading(true);

    try {
        const titleName = document.getElementById('titleName').value;
        const titleId = document.getElementById('titleId').value;
        const productCode = document.getElementById('productCode').value;
        const category = document.getElementById('titleCategory').value;
        const region = document.getElementById('titleRegion').value;
        const description = document.getElementById('titleDescription').value;
        const uploadedBy = document.getElementById('uploadedBy').value || 'Anonymous';
        const fileInput = document.getElementById('titleFile');
        const iconInput = document.getElementById('titleIcon');

        if (!fileInput.files[0]) {
            showToast('Error', 'Please select a file to upload');
            return;
        }

        const file = fileInput.files[0];
        const fileData = await readFileAsBase64(file);
        
        let iconData = null;
        if (iconInput.files[0]) {
            iconData = await readFileAsBase64(iconInput.files[0]);
        }

        // Build file path based on category
        let filePath = getDataPath(category);
        let homebrewSubcategory = null;
        let virtualConsoleSubcategory = null;
        
        if (category === 'homebrew') {
            homebrewSubcategory = document.getElementById('homebrewCategory').value;
            filePath += getHomebrewSubfolder(homebrewSubcategory);
        } else if (category === 'virtual-console') {
            virtualConsoleSubcategory = document.getElementById('virtualConsoleCategory').value;
            filePath += getVirtualConsoleSubfolder(virtualConsoleSubcategory);
        }
        
        // Sanitize filename
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath += safeFileName;

        const newFile = {
            id: generateId(),
            name: titleName,
            titleId: titleId || generateTitleId(),
            productCode: productCode || null,
            category: category,
            homebrewCategory: homebrewSubcategory,
            vcSystem: virtualConsoleSubcategory,
            region: region,
            description: description,
            uploadedBy: uploadedBy,
            downloadCount: 0,
            size: file.size,
            fileName: file.name,
            filePath: filePath,
            fileData: fileData,
            fileType: file.type,
            icon: iconData,
            fileUrl: URL.createObjectURL(file),
            uploadDate: new Date().toISOString()
        };

        AppState.uploadedFiles.push(newFile);
        saveUploadedFiles();

        // Add to appropriate category
        if (category === 'homebrew') {
            newFile.category = homebrewSubcategory;
            AppState.homebrew.push(newFile);
        } else if (category === 'virtual-console') {
            newFile.category = virtualConsoleSubcategory;
            AppState.virtualConsole.push(newFile);
        } else if (category === 'game') {
            AppState.games.push(newFile);
        } else if (category === 'dlc') {
            AppState.dlc.push(newFile);
        } else if (category === 'app') {
            AppState.apps.push(newFile);
        }

        showToast('Success', `"${titleName}" saved to ${filePath}`);
        document.getElementById('uploadForm').reset();
        renderUploadedFiles();

    } catch (error) {
        console.error('Upload error:', error);
        showToast('Error', 'Failed to upload file');
    } finally {
        showLoading(false);
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function generateId() {
    return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateTitleId() {
    return '00040000' + Math.random().toString(16).substr(2, 8).toUpperCase();
}

function loadUploadedFiles() {
    try {
        const saved = localStorage.getItem('3dseshop_uploadedFiles');
        if (saved) {
            AppState.uploadedFiles = JSON.parse(saved);
            // Re-create object URLs
            AppState.uploadedFiles.forEach(file => {
                if (file.fileData) {
                    file.fileUrl = file.fileData;
                }
            });
        }
    } catch (e) {
        console.error('Error loading uploaded files:', e);
    }
}

function saveUploadedFiles() {
    try {
        localStorage.setItem('3dseshop_uploadedFiles', JSON.stringify(AppState.uploadedFiles));
    } catch (e) {
        console.error('Error saving uploaded files:', e);
    }
}

function deleteFile(fileId) {
    // Check if user is admin
    if (!Auth.isAdmin()) {
        showToast('Access Denied', 'Only administrators can delete files');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this file?')) return;

    const index = AppState.uploadedFiles.findIndex(f => f.id === fileId);
    if (index > -1) {
        AppState.uploadedFiles.splice(index, 1);
        saveUploadedFiles();
        renderUploadedFiles();
        showToast('Deleted', 'File removed successfully');
    }
}

function downloadFile(fileId) {
    const file = AppState.uploadedFiles.find(f => f.id === fileId);
    if (file && file.fileUrl) {
        const link = document.createElement('a');
        link.href = file.fileUrl;
        link.download = file.fileName || `${file.name}.cia`;
        link.click();
    } else {
        showToast('Error', 'File not available for download');
    }
}

// ============================================
// Search Functionality
// ============================================
function performSearch(query) {
    const lowerQuery = query.toLowerCase();
    
    const results = [
        ...AppState.games.filter(g => g.name.toLowerCase().includes(lowerQuery)).map(g => ({...g, type: 'game'})),
        ...AppState.dlc.filter(d => d.name.toLowerCase().includes(lowerQuery)).map(d => ({...d, type: 'dlc'})),
        ...AppState.apps.filter(a => a.name.toLowerCase().includes(lowerQuery)).map(a => ({...a, type: 'app'})),
        ...AppState.virtualConsole.filter(vc => vc.name.toLowerCase().includes(lowerQuery)).map(vc => ({...vc, type: 'virtual-console'})),
        ...AppState.homebrew.filter(h => h.name.toLowerCase().includes(lowerQuery)).map(h => ({...h, type: 'homebrew'})),
        ...AppState.uploadedFiles.filter(f => f.name.toLowerCase().includes(lowerQuery)).map(f => ({...f, type: f.category}))
    ];

    showSection('search');
    document.getElementById('searchQuery').textContent = query;
    
    const container = document.getElementById('searchResults');
    if (results.length === 0) {
        container.innerHTML = `
            <div class="col-12 empty-state">
                <i class="bi bi-search"></i>
                <p>No results found for "${query}"</p>
            </div>
        `;
    } else {
        container.innerHTML = results.map(title => createTitleCard(title, title.type)).join('');
    }
}

// ============================================
// Filtering
// ============================================
function filterByRegion(filter) {
    AppState.currentFilter = filter;
    
    const containers = {
        'games': document.getElementById('gamesGrid'),
        'dlc': document.getElementById('dlcGrid'),
        'apps': document.getElementById('appsGrid')
    };

    const data = {
        'games': AppState.games,
        'dlc': AppState.dlc,
        'apps': AppState.apps
    };

    Object.keys(containers).forEach(key => {
        const container = containers[key];
        if (container && !container.closest('.section-content').classList.contains('d-none')) {
            const filteredData = filter === 'all' ? data[key] : data[key].filter(item => item.region === filter);
            container.innerHTML = filteredData.map(item => createTitleCard(item, key.slice(0, -1))).join('');
        }
    });
}

function filterHomebrew(category) {
    renderHomebrew(category);
}

// ============================================
// Load More
// ============================================
function loadMore(type) {
    switch(type) {
        case 'games':
            AppState.gamesPage++;
            renderGames();
            break;
        case 'dlc':
            AppState.dlcPage++;
            renderDlc();
            break;
        case 'apps':
            AppState.appsPage++;
            renderApps();
            break;
        case 'virtual-console':
            AppState.vcPage++;
            renderVirtualConsole();
            break;
    }
}

// ============================================
// Guide Content
// ============================================
function loadGuideContent(guideId) {
    const container = document.getElementById('guideBody');
    if (!container) return;

    const content = guideContent[guideId];
    if (content) {
        container.innerHTML = content;
    } else {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-construction fs-1 text-muted"></i>
                <p class="text-muted">Content coming soon</p>
                <a href="https://3ds.hacks.guide" target="_blank" class="btn btn-primary">
                    Visit 3ds.hacks.guide
                </a>
            </div>
        `;
    }
}

// ============================================
// Seeds Management
// ============================================
let currentSeedTitleId = null;
let seedsPage = 1;

async function loadSeeds(page = 1) {
    const search = document.getElementById('seedSearch')?.value || '';
    
    try {
        const response = await fetch(`/api/seeds?page=${page}&limit=50&search=${search}`);
        const result = await response.json();
        
        if (result.success) {
            seedsPage = page;
            renderSeedsTable(result.data);
            renderSeedsPagination(result.pagination);
            loadSeedStats();
        }
    } catch (error) {
        console.error('Error loading seeds:', error);
    }
}

async function loadSeedStats() {
    try {
        const response = await fetch('/api/seeds/stats');
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('totalSeeds').textContent = result.data.totalSeeds;
            document.getElementById('seedDownloads').textContent = result.data.totalDownloads;
        }
    } catch (error) {
        console.error('Error loading seed stats:', error);
    }
}

function renderSeedsTable(seeds) {
    const tbody = document.getElementById('seedsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = seeds.map(seed => `
        <tr>
            <td><code>${seed.titleId}</code></td>
            <td><span class="badge bg-success">${seed.downloadCount || 0}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="showSeedQr('${seed.titleId}')" title="Show QR">
                    <i class="bi bi-qr-code"></i>
                </button>
                <a href="/api/seeds/${seed.titleId}/download" class="btn btn-sm btn-outline-success" title="Download">
                    <i class="bi bi-download"></i>
                </a>
            </td>
        </tr>
    `).join('');
}

function renderSeedsPagination(pagination) {
    const container = document.getElementById('seedsPagination');
    if (!container || !pagination || pagination.pages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= pagination.pages; i++) {
        html += `
            <li class="page-item ${i === pagination.page ? 'active' : ''}">
                <a class="page-link" href="#" onclick="loadSeeds(${i}); return false;">${i}</a>
            </li>
        `;
    }
    container.innerHTML = html;
}

async function showSeedQr(titleId) {
    currentSeedTitleId = titleId;
    
    const modal = new bootstrap.Modal(document.getElementById('seedQrModal'));
    const container = document.getElementById('seedQrCodeContainer');
    
    // Clear previous QR
    container.innerHTML = '';
    
    // Generate QR code for FBI remote install
    const downloadUrl = `${window.location.origin}/api/seeds/${titleId}/download`;
    
    QRCode.toCanvas(downloadUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
    }, (error, canvas) => {
        if (!error) container.appendChild(canvas);
    });
    
    document.getElementById('seedQrTitleId').textContent = titleId;
    document.getElementById('seedFbiPath').textContent = `sd:/fbi/seed/${titleId}.dat`;
    
    modal.show();
}

function downloadSeedDirect() {
    if (currentSeedTitleId) {
        window.open(`/api/seeds/${currentSeedTitleId}/download`, '_blank');
    }
}

function copySeedLink() {
    if (currentSeedTitleId) {
        const url = `${window.location.origin}/api/seeds/${currentSeedTitleId}/download`;
        navigator.clipboard.writeText(url).then(() => {
            showToast('Copied!', 'Download link copied to clipboard');
        });
    }
}

async function refreshSeeds() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/seeds/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Success', `Loaded ${result.count} seeds`);
            loadSeeds();
        } else {
            showToast('Error', result.error);
        }
    } catch (error) {
        showToast('Error', 'Failed to refresh seeds');
    } finally {
        showLoading(false);
    }
}

// Upload seeddb.bin form
document.getElementById('uploadSeeddbForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(true);
    
    const formData = new FormData();
    formData.append('seeddb', document.getElementById('seeddbFile').files[0]);
    formData.append('uploadedBy', document.getElementById('seeddbUploadedBy').value || 'Anonymous');
    
    try {
        const response = await fetch('/api/seeds/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if (result.success) {
            bootstrap.Modal.getInstance(document.getElementById('uploadSeeddbModal')).hide();
            showToast('Success', result.message);
            loadSeeds();
        } else {
            showToast('Error', result.error);
        }
    } catch (error) {
        showToast('Error', 'Failed to upload seeddb.bin');
    } finally {
        showLoading(false);
    }
});

// Seed search
document.getElementById('seedSearch')?.addEventListener('input', () => {
    clearTimeout(window.seedSearchTimeout);
    window.seedSearchTimeout = setTimeout(() => loadSeeds(), 300);
});

// ============================================
// Utility Functions
// ============================================
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function bytesToBlocks(bytes) {
    if (!bytes) return '0';
    // 1 block = 128KB = 131072 bytes on 3DS
    return Math.ceil(bytes / 131072).toLocaleString();
}

function formatSizeWithBlocks(bytes) {
    if (!bytes) return 'Unknown';
    return `${formatFileSize(bytes)} (${bytesToBlocks(bytes)} blocks)`;
}

function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.toggle('d-none', !show);
    }
}

function showToast(title, message) {
    const toastEl = document.getElementById('notificationToast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastBody').textContent = message;
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// Make functions globally accessible
window.showQrCode = showQrCode;
window.showTitleDetails = showTitleDetails;
window.downloadFile = downloadFile;
window.deleteFile = deleteFile;
