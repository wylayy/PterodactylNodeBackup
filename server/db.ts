import Database from 'better-sqlite3';
import { config } from './config.js';
import { log } from './logger.js';

export const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'key',
    ssh_key_path TEXT,
    ssh_password TEXT,
    volumes_path TEXT DEFAULT '/var/lib/pterodactyl/volumes',
    status TEXT DEFAULT 'unknown',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    volume_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    storage_type TEXT NOT NULL,
    storage_path TEXT,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id)
  );

  CREATE TABLE IF NOT EXISTS backup_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_id INTEGER NOT NULL,
    level TEXT DEFAULT 'info',
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (backup_id) REFERENCES backups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    storage_type TEXT NOT NULL,
    retention_count INTEGER DEFAULT 7,
    enabled INTEGER DEFAULT 1,
    last_run TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

log.info('Database initialized');

// Column whitelists for SQL injection prevention
const ALLOWED_NODE_COLUMNS = ['name', 'host', 'port', 'username', 'auth_type', 'ssh_key_path', 'ssh_password', 'volumes_path', 'status'];
const ALLOWED_BACKUP_COLUMNS = ['node_id', 'volume_name', 'filename', 'size', 'storage_type', 'storage_path', 'status', 'progress', 'error_message', 'started_at', 'completed_at'];
const ALLOWED_SCHEDULE_COLUMNS = ['node_id', 'name', 'cron_expression', 'storage_type', 'retention_count', 'enabled', 'last_run'];

function sanitizeUpdate(data: any, allowedColumns: string[]): { fields: string; values: any[] } {
  const safeKeys = Object.keys(data).filter(k => allowedColumns.includes(k));
  if (safeKeys.length === 0) throw new Error('No valid fields to update');
  return {
    fields: safeKeys.map(k => `${k} = ?`).join(', '),
    values: safeKeys.map(k => data[k]),
  };
}

// Node repository
export const nodeRepo = {
  getAll: () => db.prepare('SELECT * FROM nodes ORDER BY name').all() as any[],
  getById: (id: number) => db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any,
  getByName: (name: string) => db.prepare('SELECT * FROM nodes WHERE name = ?').get(name) as any,
  create: (node: any) => {
    const stmt = db.prepare(`INSERT INTO nodes (name, host, port, username, auth_type, ssh_key_path, ssh_password, volumes_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    return stmt.run(node.name, node.host, node.port, node.username, node.auth_type, node.ssh_key_path, node.ssh_password, node.volumes_path).lastInsertRowid;
  },
  update: (id: number, node: any) => {
    const { fields, values } = sanitizeUpdate(node, ALLOWED_NODE_COLUMNS);
    db.prepare(`UPDATE nodes SET ${fields} WHERE id = ?`).run(...values, id);
  },
  updateStatus: (id: number, status: string) => db.prepare('UPDATE nodes SET status = ? WHERE id = ?').run(status, id),
  delete: (id: number) => db.prepare('DELETE FROM nodes WHERE id = ?').run(id),
};

// Backup repository
export const backupRepo = {
  getAll: (limit = 100) => db.prepare(`
    SELECT b.*, n.name as node_name FROM backups b 
    LEFT JOIN nodes n ON b.node_id = n.id 
    ORDER BY b.created_at DESC LIMIT ?
  `).all(limit) as any[],
  getById: (id: number) => db.prepare('SELECT * FROM backups WHERE id = ?').get(id) as any,
  getByNode: (nodeId: number) => db.prepare('SELECT * FROM backups WHERE node_id = ? ORDER BY created_at DESC').all(nodeId) as any[],
  getRunning: () => db.prepare('SELECT b.*, n.name as node_name FROM backups b LEFT JOIN nodes n ON b.node_id = n.id WHERE b.status = ? ORDER BY b.started_at DESC').all('running') as any[],
  create: (backup: any) => {
    const stmt = db.prepare(`INSERT INTO backups (node_id, volume_name, filename, storage_type, status, started_at) VALUES (?, ?, ?, ?, ?, ?)`);
    return stmt.run(backup.node_id, backup.volume_name, backup.filename, backup.storage_type, backup.status || 'running', backup.started_at || new Date().toISOString()).lastInsertRowid as number;
  },
  update: (id: number, data: any) => {
    const { fields, values } = sanitizeUpdate(data, ALLOWED_BACKUP_COLUMNS);
    db.prepare(`UPDATE backups SET ${fields} WHERE id = ?`).run(...values, id);
  },
  updateProgress: (id: number, progress: number) => db.prepare('UPDATE backups SET progress = ? WHERE id = ?').run(progress, id),
  fail: (id: number, error: string) => db.prepare('UPDATE backups SET status = ?, error_message = ?, progress = 0 WHERE id = ?').run('failed', error, id),
  delete: (id: number) => {
    db.prepare('DELETE FROM backup_logs WHERE backup_id = ?').run(id);
    db.prepare('DELETE FROM backups WHERE id = ?').run(id);
  },
  getStats: () => db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
           SUM(size) as total_size
    FROM backups
  `).get() as any,
};

// Backup logs repository
export const backupLogRepo = {
  getByBackup: (backupId: number) => db.prepare('SELECT * FROM backup_logs WHERE backup_id = ? ORDER BY created_at ASC').all(backupId) as any[],
  add: (backupId: number, level: string, message: string) => {
    db.prepare('INSERT INTO backup_logs (backup_id, level, message) VALUES (?, ?, ?)').run(backupId, level, message);
  },
  clear: (backupId: number) => db.prepare('DELETE FROM backup_logs WHERE backup_id = ?').run(backupId),
};

// Schedule repository
export const scheduleRepo = {
  getAll: () => db.prepare(`
    SELECT s.*, n.name as node_name FROM schedules s 
    LEFT JOIN nodes n ON s.node_id = n.id 
    ORDER BY s.name
  `).all() as any[],
  getById: (id: number) => db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any,
  getEnabled: () => db.prepare('SELECT * FROM schedules WHERE enabled = 1').all() as any[],
  create: (s: any) => {
    const stmt = db.prepare(`INSERT INTO schedules (node_id, name, cron_expression, storage_type, retention_count, enabled) VALUES (?, ?, ?, ?, ?, ?)`);
    return stmt.run(s.node_id, s.name, s.cron_expression, s.storage_type, s.retention_count || 7, s.enabled ? 1 : 0).lastInsertRowid;
  },
  update: (id: number, data: any) => {
    const { fields, values } = sanitizeUpdate(data, ALLOWED_SCHEDULE_COLUMNS);
    db.prepare(`UPDATE schedules SET ${fields} WHERE id = ?`).run(...values, id);
  },
  delete: (id: number) => db.prepare('DELETE FROM schedules WHERE id = ?').run(id),
};

// Settings repository
export const settingsRepo = {
  get: (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any)?.value,
  set: (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value),
  getAll: () => db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[],
};
