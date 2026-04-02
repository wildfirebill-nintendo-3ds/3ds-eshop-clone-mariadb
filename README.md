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
- **Hack Guide** - 3DS hacking tutorials
- **Upload** - File upload interface

### File Management
- Upload CIA, 3DSX, 3DS, ZIP files (up to 5GB)
- SHA256 hash calculation
- Download tracking
- Product code support
- Block size display
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

### Additional Features
- Dark mode with persistence
- Search across all titles
- Responsive design
- Toast notifications
- Game icons from GitHub

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) 16+
- [MariaDB](https://mariadb.org/download/) or MySQL

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

3. Create the database:
```bash
mysql -u root -p < schema.sql
```

4. Configure `.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=3ds_eshop
PORT=4000
```

5. Start the server:
```bash
npm start
```

6. Open in browser:
- **eShop:** http://localhost:4000
- **Admin:** http://localhost:4000/admin.html

### Development
```bash
npm run dev
```

## Default Admin Credentials
- **Username:** `admin`
- **Password:** `admin123`

## File Structure

```
3ds-eshop-clone/
├── server.js           # Express backend
├── db.js               # MariaDB module
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
| GET | `/api/logs` | Get logs |
| DELETE | `/api/logs` | Clear logs |

## Using with FBI

1. Open FBI on your 3DS
2. Go to **Remote Install** → **Scan QR Code**
3. Point camera at the QR code

### Seeds
Seeds go to `sd:/fbi/seed/<titleid>.dat`

## Technologies

- **Frontend:** HTML5, Bootstrap 5, Chart.js, QRCode.js
- **Backend:** Node.js, Express 4
- **Database:** MariaDB (mysql2)
- **Upload:** Multer

## Credits

- [3DS Game Icons](https://github.com/wildfirebill-nintendo-3ds/3dsgamesicons)
- [3DS-rom-tools](https://github.com/ihaveamac/3DS-rom-tools)
- [3ds.hacks.guide](https://3ds.hacks.guide)

## License

MIT
