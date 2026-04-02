# 3DS eShop Clone

A web-based Nintendo 3DS eShop clone with MariaDB backend, file management, QR code generation, and FBI seed support.

## Description

Recreates the Nintendo 3DS eShop experience as a web application. Browse games, DLC, apps, Virtual Console titles, and homebrew. Upload files and generate QR codes for easy installation via FBI on modded 3DS consoles.

## Features

### Content Sections
- **Home** - Featured carousel, games, and recent homebrew
- **Games** - 3DS games with region filtering (USA/EUR/JPN)
- **DLC** - Downloadable content
- **Apps** - System applications
- **Virtual Console** - NES, SNES, Game Boy, GBC, GBA, N64, Genesis
- **Homebrew** - Emulators, utilities, games, themes, CFW tools
- **Seeds** - FBI seed database (1800+ seeds)
- **Stats** - Upload/download charts and statistics
- **Hack Guide** - 3DS hacking tutorials
- **Upload** - File upload interface

### File Management
- Upload CIA, 3DSX, 3DS, ZIP files (up to 5GB)
- SHA256 hash calculation
- Download tracking
- Product code support (CTR-P-XXXX)
- Block size display (1 block = 128KB)
- Files organized by category

### QR Code System
- Generate QR codes for any title
- Download QR as PNG
- Copy direct links
- FBI remote install support

### Admin Panel (`/admin.html`)
- Dashboard with statistics cards
- Charts (uploads, downloads, categories)
- File management (edit/delete)
- Activity logs
- Uploaders leaderboard

### Statistics (Public)
- Total files and downloads
- Activity chart (7 days)
- Category distribution
- Uploads by user chart
- Top downloaded files
- Recent uploads

### Additional Features
- Dark mode with persistence
- Search across all titles
- Responsive design (Bootstrap 5)
- Toast notifications
- Game icons from GitHub

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 22.17.0+ |
| Backend | Express | 4.21.0 |
| Database | MariaDB | 12.2.2 |
| Frontend | Bootstrap | 5.3.2 |
| Charts | Chart.js | Latest |
| QR Codes | QRCode.js | 1.5.3 |

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) 22+
- [MariaDB](https://mariadb.org/download/) 10+

### Steps

1. Clone the repository:
```bash
git clone https://github.com/your-username/3ds-eshop-clone.git
cd 3ds-eshop-clone
```

2. Install dependencies:
```bash
npm install
```

3. Start MariaDB:
```bash
"C:\Program Files\MariaDB 12.2\bin\mariadbd.exe" --console
```

4. Create database:
```bash
mysql -u root -e "CREATE DATABASE 3ds_eshop;"
mysql -u root 3ds_eshop < schema.sql
```

5. Configure `.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=3ds_eshop
PORT=4000
```

6. Start the server:
```bash
npm start
```

7. Open in browser:
- **eShop:** http://localhost:4000
- **Admin:** http://localhost:4000/admin.html

### Development Mode
```bash
npm run dev
```

## Default Admin Credentials
- **Username:** `admin`
- **Password:** `admin123`

## File Structure

```
3ds-eshop-clone/
├── server.js           # Express backend (ES modules)
├── db.js               # MariaDB module (ES modules)
├── index.html          # Main frontend
├── admin.html          # Admin panel
├── schema.sql          # Database schema
├── .env                # Configuration
├── package.json
├── css/
│   └── styles.css
├── js/
│   └── app.js
└── data/
    ├── games/
    ├── dlc/
    ├── apps/
    ├── virtual-console/
    ├── homebrew/
    └── seeds/
```

## Database Tables

| Table | Description |
|-------|-------------|
| `files` | Uploaded file metadata |
| `logs` | Activity logs |
| `stats` | Daily statistics |
| `seeds` | FBI seeds |
| `users` | Admin accounts |

## API Endpoints

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | List files |
| GET | `/api/files/:id` | Get file |
| POST | `/api/files/upload` | Upload file |
| PUT | `/api/files/:id` | Update file |
| DELETE | `/api/files/:id` | Delete file |
| GET | `/api/download/:id` | Download file |

### Seeds
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/seeds` | List seeds |
| GET | `/api/seeds/:titleId` | Get seed |
| GET | `/api/seeds/:titleId/download` | Download seed |
| POST | `/api/seeds/refresh` | Refresh seeds |
| POST | `/api/seeds/upload` | Upload seeddb.bin |

### Stats & Logs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Get statistics |
| GET | `/api/stats/uploads` | Get upload chart data |
| GET | `/api/logs` | Get logs |
| DELETE | `/api/logs` | Clear logs |

## Using with FBI

1. Open FBI on your 3DS
2. Go to **Remote Install** → **Scan QR Code**
3. Point camera at the QR code

### Seeds
Seeds go to `sd:/fbi/seed/<titleid>.dat`

## MariaDB Test Results

| Test | Status | Result |
|------|--------|--------|
| MariaDB Install | ✅ | Version 12.2.2 |
| Database Create | ✅ | 3ds_eshop created |
| Tables Create | ✅ | 5 tables created |
| Server Start | ✅ | Running on port 4000 |
| API: /api/stats | ✅ | Returns JSON |
| API: /api/files | ✅ | Returns JSON |
| API: /api/seeds | ✅ | Returns JSON |
| Main Page Load | ✅ | HTML served |
| Admin Page Load | ✅ | Charts work |

## Node.js v22+ Upgrades

- ES Modules (`import/export`) instead of CommonJS (`require`)
- Native `fetch()` API instead of `http/https` modules
- `fs/promises` for async file operations
- `stream/promises` pipeline for file hashing
- `import.meta.url` for `__dirname`
- `node --watch` for development (no nodemon needed)
- Modern nullish coalescing (`??`) operator
- Template literals for strings
- `.slice()` instead of deprecated `.substr()`

## Security

- Helmet.js for HTTP headers
- CORS enabled
- SHA256 file integrity
- Input validation
- Admin authentication

## Credits

- [3DS Game Icons](https://github.com/wildfirebill-nintendo-3ds/3dsgamesicons)
- [3DS-rom-tools](https://github.com/ihaveamac/3DS-rom-tools)
- [3ds.hacks.guide](https://3ds.hacks.guide)

## License

MIT
