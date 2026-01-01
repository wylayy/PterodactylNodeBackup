import SftpClient from 'ssh2-sftp-client';
import { createWriteStream, createReadStream, existsSync, mkdirSync, unlinkSync, statSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import archiver from 'archiver';
import { config } from './config.js';
import { log } from './logger.js';
import { storage, StorageType } from './storage.js';
import { nodeRepo, backupRepo, backupLogRepo } from './db.js';
import { sendWebhook } from './webhook';

export interface BackupOptions {
    nodeId: number;
    volumeName?: string;
    storageType: StorageType;
    backupId?: number;
}

// Helper to log and save to database
function backupLog(backupId: number, level: 'info' | 'warn' | 'error', message: string) {
    log[level](message);
    backupLogRepo.add(backupId, level, message);
}

export async function createBackup(options: BackupOptions): Promise<number> {
    const startTime = Date.now();
    const node = nodeRepo.getById(options.nodeId);
    if (!node) throw new Error('Node not found');

    const volumeName = options.volumeName || 'all-volumes';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${node.name}-${volumeName}-${timestamp}.tar.gz`;

    let backupId = options.backupId;

    if (backupId) {
        backupRepo.update(backupId, {
            filename,
            status: 'running',
            started_at: new Date().toISOString(),
        });
    } else {
        backupId = backupRepo.create({
            node_id: options.nodeId,
            volume_name: volumeName,
            filename,
            storage_type: options.storageType,
            status: 'running',
        }) as number;
    }

    backupLog(backupId, 'info', `Starting backup: ${filename}`);
    backupRepo.updateProgress(backupId, 5);

    sendWebhook('info', 'Backup Started', `**${node.name}** - ${volumeName}`, [
        { name: 'Storage Type', value: options.storageType, inline: true },
    ]);

    try {
        // Connect to node
        backupLog(backupId, 'info', `Connecting to ${node.name} (${node.host})`);
        const client = new SftpClient();
        await connectToNode(client, node);
        backupRepo.updateProgress(backupId, 10);

        const volumesPath = node.volumes_path || config.wings.volumesPath;
        let volumes: string[];

        if (volumeName === 'all-volumes') {
            const list = await client.list(volumesPath);
            volumes = list.filter((f: any) => f.type === 'd' && !f.name.startsWith('.')).map((f: any) => f.name);
            backupLog(backupId, 'info', `Found ${volumes.length} volumes`);
        } else {
            volumes = [volumeName];
        }
        backupRepo.updateProgress(backupId, 15);

        // Download volumes
        const tempDir = resolve(config.paths.data, 'temp', `backup-${backupId}`);
        mkdirSync(tempDir, { recursive: true });

        const downloadProgress = 60; // 15-75% for downloading
        for (let i = 0; i < volumes.length; i++) {
            const vol = volumes[i];
            const localPath = resolve(tempDir, vol);
            mkdirSync(localPath, { recursive: true });

            // Safe Backup Logic
            let wasRunning = false;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vol);

            if (isUuid) {
                try {
                    const { getServerState, setServerState } = await import('./pterodactyl.js');
                    const state = await getServerState(vol);
                    if (state && state !== 'offline') {
                        wasRunning = true;
                        backupLog(backupId, 'info', `[Safe Backup] Stopping server ${vol}...`);
                        await setServerState(vol, 'stop');
                        // Wait for offline (max 60s)
                        for (let j = 0; j < 12; j++) {
                            await new Promise(r => setTimeout(r, 5000));
                            const newState = await getServerState(vol);
                            if (newState === 'offline') break;
                        }
                    }
                } catch (err: any) {
                    // Ignore if settings incomplete or error
                }
            }

            backupLog(backupId, 'info', `Downloading volume: ${vol} (${i + 1}/${volumes.length})`);
            try {
                await client.downloadDir(`${volumesPath}/${vol}`, localPath);
            } catch (err: any) {
                backupLog(backupId, 'warn', `Failed to download ${vol}: ${err.message}`);
            }

            if (wasRunning) {
                backupLog(backupId, 'info', `[Safe Backup] Restoring server ${vol}...`);
                try {
                    const { setServerState } = await import('./pterodactyl.js');
                    await setServerState(vol, 'start');
                } catch (err) {
                    backupLog(backupId, 'warn', `Failed to restart server`);
                }
            }

            const progress = 15 + Math.floor(((i + 1) / volumes.length) * downloadProgress);
            backupRepo.updateProgress(backupId, progress);
        }
        await client.end();
        backupLog(backupId, 'info', 'Download complete');
        backupRepo.updateProgress(backupId, 75);

        // Create archive
        backupLog(backupId, 'info', 'Compressing backup...');
        const tempFile = resolve(config.paths.data, 'temp', filename);
        await createArchive(tempDir, tempFile);
        const fileSize = statSync(tempFile).size;
        backupLog(backupId, 'info', `Archive created: ${formatSize(fileSize)}`);
        backupRepo.updateProgress(backupId, 85);

        // Upload to storage
        backupLog(backupId, 'info', `Uploading to ${options.storageType} storage...`);
        const backend = storage.get(options.storageType);
        const storagePath = await backend.upload(tempFile, filename);
        backupRepo.updateProgress(backupId, 95);

        // Cleanup
        rmSync(tempDir, { recursive: true, force: true });
        unlinkSync(tempFile);

        // Update record
        backupRepo.update(backupId, {
            storage_path: storagePath,
            size: fileSize,
            status: 'completed',
            progress: 100,
            completed_at: new Date().toISOString(),
        });

        const durationMs = Date.now() - startTime;
        const durationSec = Math.floor(durationMs / 1000);
        const duration = durationSec > 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`;

        backupLog(backupId, 'info', `Backup completed: ${formatSize(fileSize)} in ${duration}`);
        sendWebhook('success', 'Backup Completed', `**${node.name}** - ${volumeName}`, [
            { name: 'Size', value: formatSize(fileSize), inline: true },
            { name: 'Duration', value: duration, inline: true },
            { name: 'Filename', value: filename, inline: false },
        ]);

        return backupId;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        backupRepo.fail(backupId, msg);
        backupLog(backupId, 'error', `Backup failed: ${msg}`);
        sendWebhook('error', 'Backup Failed', `**${node.name}** - ${volumeName}`, [
            { name: 'Error', value: msg.slice(0, 200) },
        ]);
        throw err;
    }
}

export async function deleteBackup(id: number): Promise<void> {
    const backup = backupRepo.getById(id);
    if (!backup) throw new Error('Backup not found');

    try {
        const backend = storage.get(backup.storage_type as StorageType);
        await backend.delete(backup.filename);
    } catch (err) {
        log.warn(`Failed to delete file: ${err}`);
    }

    backupRepo.delete(id);
    log.info(`Deleted backup ${id}`);
}

export async function getBackupFile(id: number): Promise<{ stream: NodeJS.ReadableStream; filename: string; size: number } | null> {
    const backup = backupRepo.getById(id);
    if (!backup || backup.status !== 'completed') return null;

    const backend = storage.get(backup.storage_type as StorageType);

    if (backup.storage_type === 'local') {
        const filePath = backup.storage_path;
        if (!existsSync(filePath)) return null;
        return { stream: createReadStream(filePath), filename: backup.filename, size: backup.size };
    }

    // For cloud/remote, download to temp first
    const tempPath = resolve(config.paths.data, 'temp', backup.filename);
    await backend.download(backup.filename, tempPath);
    return { stream: createReadStream(tempPath), filename: backup.filename, size: backup.size };
}

export async function testNodeConnection(node: any): Promise<boolean> {
    const client = new SftpClient();
    try {
        await connectToNode(client, node);
        await client.list(node.volumes_path || config.wings.volumesPath);
        return true;
    } catch (err) {
        log.error(`Node test failed: ${err}`);
        return false;
    } finally {
        await client.end();
    }
}

export async function getNodeVolumes(node: any): Promise<string[]> {
    const client = new SftpClient();
    try {
        await connectToNode(client, node);
        const list = await client.list(node.volumes_path || config.wings.volumesPath);
        return list.filter((f: any) => f.type === 'd' && !f.name.startsWith('.')).map((f: any) => f.name);
    } finally {
        await client.end();
    }
}

async function connectToNode(client: SftpClient, node: any): Promise<void> {
    const opts: any = { host: node.host, port: node.port || 22, username: node.username };
    if (node.auth_type === 'key' && node.ssh_key_path) {
        opts.privateKey = await readFile(node.ssh_key_path);
    } else if (node.ssh_password) {
        opts.password = node.ssh_password;
    }
    await client.connect(opts);
}

function createArchive(srcDir: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(destPath);
        const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(srcDir, false);
        archive.finalize();
    });
}

function formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(2)} ${units[i]}`;
}
