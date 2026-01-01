import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Ensure directories exist
const dataDir = resolve(rootDir, 'data');
const backupsDir = resolve(dataDir, 'backups');
const logsDir = resolve(rootDir, 'logs');

[dataDir, backupsDir, logsDir].forEach(dir => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Generate random JWT secret if not provided (will change on restart!)
const jwtSecret = process.env.JWT_SECRET || randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using random secret (tokens will invalidate on restart)');
}

// Check for weak credentials
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASS || 'admin';
if (adminUser === 'admin' && adminPass === 'admin') {
    console.warn('⚠️  SECURITY WARNING: Using default admin credentials (admin:admin). Change ADMIN_USER and ADMIN_PASS in .env!');
}

export const config = {
    web: {
        port: parseInt(process.env.PORT || '3000'),
        secret: jwtSecret,
        adminUser,
        adminPass,
    },

    db: {
        path: resolve(dataDir, 'database.sqlite'),
    },

    storage: {
        local: { path: backupsDir },
    },

    wings: {
        volumesPath: process.env.VOLUMES_PATH || '/var/lib/pterodactyl/volumes',
    },

    paths: { root: rootDir, data: dataDir, backups: backupsDir, logs: logsDir },
};
