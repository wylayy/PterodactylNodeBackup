import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { resolve } from 'path';
import { config } from './config.js';
import { log } from './logger.js';
import { nodeRepo, backupRepo, backupLogRepo, scheduleRepo, settingsRepo } from './db.js';
import { createBackup, deleteBackup, getBackupFile, testNodeConnection, getNodeVolumes } from './backup.js';
import { initScheduler, addJob, removeJob, stopScheduler } from './scheduler.js';
import { storage, StorageType } from './storage.js';

const app = express();
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// Rate limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { error: 'Too many requests, please slow down' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Auth middleware
function auth(req: any, res: any, next: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, config.web.secret);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Login (with stricter rate limiting)
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username === config.web.adminUser && password === config.web.adminPass) {
        const token = jwt.sign({ username }, config.web.secret, { expiresIn: '24h' });
        log.info(`User '${username}' logged in successfully`);
        res.json({ token, username });
    } else {
        log.warn(`Failed login attempt for user '${username}'`);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Stats
app.get('/api/stats', auth, (req, res) => {
    const stats = backupRepo.getStats();
    const nodes = nodeRepo.getAll().length;
    const schedules = scheduleRepo.getAll().length;
    const recent = backupRepo.getAll(5);
    res.json({ ...stats, nodes, schedules, recent });
});

// Nodes
app.get('/api/nodes', auth, (req, res) => {
    const nodes = nodeRepo.getAll().map((n: any) => ({ ...n, ssh_password: undefined }));
    res.json(nodes);
});

// Input validation helpers
function validateNode(data: any): string | null {
    if (!data.name || typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 100) {
        return 'Name is required (1-100 characters)';
    }
    if (!data.host || typeof data.host !== 'string') {
        return 'Host is required';
    }
    if (data.port && (typeof data.port !== 'number' || data.port < 1 || data.port > 65535)) {
        return 'Port must be between 1 and 65535';
    }
    if (!data.username || typeof data.username !== 'string') {
        return 'Username is required';
    }
    if (data.auth_type && !['key', 'password'].includes(data.auth_type)) {
        return 'auth_type must be "key" or "password"';
    }
    return null;
}

app.post('/api/nodes', auth, (req, res) => {
    try {
        const validationError = validateNode(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        const id = nodeRepo.create(req.body);
        res.json({ id, message: 'Node created' });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/nodes/:id', auth, (req, res) => {
    try {
        nodeRepo.update(Number(req.params.id), req.body);
        res.json({ message: 'Node updated' });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/nodes/:id', auth, (req, res) => {
    nodeRepo.delete(Number(req.params.id));
    res.json({ message: 'Deleted' });
});

app.post('/api/nodes/:id/test', auth, async (req, res) => {
    const node = nodeRepo.getById(Number(req.params.id));
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const ok = await testNodeConnection(node);
    nodeRepo.updateStatus(node.id, ok ? 'online' : 'offline');
    res.json({ success: ok, status: ok ? 'online' : 'offline' });
});

app.get('/api/nodes/:id/volumes', auth, async (req, res) => {
    const node = nodeRepo.getById(Number(req.params.id));
    if (!node) return res.status(404).json({ error: 'Node not found' });
    try {
        const volumes = await getNodeVolumes(node);
        res.json(volumes);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Backups
app.get('/api/backups', auth, (req, res) => {
    res.json(backupRepo.getAll());
});

app.get('/api/backups/running', auth, (req, res) => {
    res.json(backupRepo.getRunning());
});

app.post('/api/backups', auth, async (req, res) => {
    try {
        // Start backup in background, return immediately
        const id = backupRepo.create({
            node_id: req.body.nodeId,
            volume_name: req.body.volumeName || 'all-volumes',
            filename: 'pending',
            storage_type: req.body.storageType,
            status: 'pending',
        });

        // Execute backup async
        createBackup({ ...req.body, backupId: id }).catch((err) => {
            log.error(`Backup ${id} failed: ${err.message}`);
        });

        res.json({ id, message: 'Backup started' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/backups/:id/logs', auth, (req, res) => {
    const logs = backupLogRepo.getByBackup(Number(req.params.id));
    res.json(logs);
});

app.get('/api/backups/:id/download', auth, async (req, res) => {
    try {
        const result = await getBackupFile(Number(req.params.id));
        if (!result) return res.status(404).json({ error: 'Backup not found or not completed' });

        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Length', result.size);
        result.stream.pipe(res);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/backups/:id', auth, async (req, res) => {
    try {
        await deleteBackup(Number(req.params.id));
        res.json({ message: 'Deleted' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


// Schedules
app.get('/api/schedules', auth, (req, res) => {
    res.json(scheduleRepo.getAll());
});

app.post('/api/schedules', auth, (req, res) => {
    try {
        const id = scheduleRepo.create(req.body);
        const schedule = scheduleRepo.getById(id as number);
        if (schedule) addJob(schedule);
        res.json({ id, message: 'Schedule created' });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/schedules/:id', auth, (req, res) => {
    try {
        const id = Number(req.params.id);
        scheduleRepo.update(id, req.body);
        const schedule = scheduleRepo.getById(id);
        if (schedule && schedule.enabled) addJob(schedule);
        else removeJob(id);
        res.json({ message: 'Schedule updated' });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/schedules/:id/toggle', auth, (req, res) => {
    const schedule = scheduleRepo.getById(Number(req.params.id));
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    const enabled = schedule.enabled ? 0 : 1;
    scheduleRepo.update(schedule.id, { enabled });
    if (enabled) addJob({ ...schedule, enabled: 1 });
    else removeJob(schedule.id);
    res.json({ enabled: !!enabled });
});

app.delete('/api/schedules/:id', auth, (req, res) => {
    removeJob(Number(req.params.id));
    scheduleRepo.delete(Number(req.params.id));
    res.json({ message: 'Deleted' });
});

app.post('/api/schedules/:id/run', auth, async (req, res) => {
    const schedule = scheduleRepo.getById(Number(req.params.id));
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    try {
        const id = await createBackup({ nodeId: schedule.node_id, storageType: schedule.storage_type });
        res.json({ backupId: id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Settings
app.get('/api/settings', auth, (req, res) => {
    const settings = Object.fromEntries(settingsRepo.getAll().map((s: any) => [s.key, s.value]));
    const storageStatus = {
        local: storage.isConfigured('local'),
        cloud: storage.isConfigured('cloud'),
        remote: storage.isConfigured('remote'),
    };
    res.json({ settings, storageStatus });
});

app.post('/api/settings', auth, (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
        settingsRepo.set(key, String(value));
    }
    res.json({ message: 'Saved' });
});

// Serve static files
const clientDist = resolve(config.paths.root, 'dist');
app.use(express.static(clientDist));
app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(resolve(clientDist, 'index.html'));
});

// Start server
export function startServer(): void {
    initScheduler();
    app.listen(config.web.port, () => {
        log.info(`Server running at http://localhost:${config.web.port}`);
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    log.info('Shutting down...');
    stopScheduler();
    process.exit(0);
});
