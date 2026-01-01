# Pterodactyl Backup System

A robust web dashboard for backing up Pterodactyl/Wings node Docker volumes.

## Features

- **🌐 Modern Dashboard:** Sleek, dark-themed UI for managing backups and nodes.
- **🛡️ Safe Backup:** Automatically stops servers before backup and restarts them afterwards to ensure data integrity.
- **💾 Storage Backends:**
  - Local Disk
  - Cloud Storage (S3, MinIO, B2, etc.)
  - Remote Storage (SFTP)
- **⚙️ Dynamic Configuration:** Manage S3, SFTP, and Discord keys directly from the dashboard (no restart required).
- **⏰ Scheduler:** Automated backups via configurable cron schedules.
- **🔔 Notifications:** Rich Discord webhook notifications for success/failure with detailed stats.

## Quick Start

### 1. Installation

```bash
# Clone and install dependencies
git clone <repo-url>
cd pterodactyl-backup
npm install
```

### 2. Basic Configuration

Copy the example environment file and set the basic server options.

```bash
cp .env.example .env
nano .env
```

**Note:** Only basic server settings (Port, JWT Secret, Admin User/Pass) are configured in `.env`.
All storage (S3/SFTP) and Pterodactyl API settings are managed via the Web Dashboard.

### 3. Running

```bash
# Development (Hot reload)
npm run dev

# Production
npm run build
npm start
```

- **Dashboard:** http://localhost:3000
- **Default Login:** `admin` / `admin` (change in `.env`)

## Configuration Guide

### Storage & Notifications
Navigate to the **Settings** page in the dashboard to configure:
- **Cloud Storage (S3):** Endpoint, Bucket, Region, Access Keys.
- **Remote Storage (SFTP):** Host, User, Password, Path.
- **Notifications:** Discord Webhook URL.

### Safe Backup
To enable "Safe Backup" (Stop server -> Backup -> Start server):
1. Go to **Settings**.
2. Enter your **Pterodactyl Panel URL**.
3. Enter a **Client API Key** (from your Pterodactyl Account Settings).
4. Save Configuration.

## Project Structure

```
├── server/          # Express API & Backend Logic
│   ├── backup.ts    # Backup engine (Safe Mode logic)
│   ├── storage.ts   # Storage adapters (Local/S3/SFTP)
│   ├── db.ts        # SQLite database wrapper
│   └── pterodactyl.ts # Pterodactyl API client
├── src/             # React Frontend
│   ├── pages/       # Dashboard Views
│   └── components/  # Reusable UI components
└── data/            # Database & Local Backups
```

## License

MIT
