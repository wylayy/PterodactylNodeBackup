import { createWriteStream, createReadStream, existsSync, mkdirSync, unlinkSync, statSync, readdirSync, rmSync } from 'fs';
import { resolve, basename } from 'path';
import { pipeline } from 'stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import SftpClient from 'ssh2-sftp-client';
import { config } from './config.js';
import { log } from './logger.js';
import { settingsRepo } from './db.js';

export type StorageType = 'local' | 'cloud' | 'remote';

interface StorageBackend {
    upload(localPath: string, filename: string): Promise<string>;
    download(filename: string, localPath: string): Promise<void>;
    delete(filename: string): Promise<void>;
    exists(filename: string): Promise<boolean>;
    list(): Promise<string[]>;
    getSize(filename: string): Promise<number>;
}

// Local Storage
class LocalStorage implements StorageBackend {
    private basePath: string;

    constructor() {
        this.basePath = config.storage.local.path;
        if (!existsSync(this.basePath)) mkdirSync(this.basePath, { recursive: true });
    }

    private sanitizeFilename(filename: string): string {
        // Prevent path traversal by extracting only the basename
        const safe = basename(filename);
        if (!safe || safe !== filename) {
            log.warn(`Path traversal attempt blocked: ${filename} -> ${safe}`);
        }
        return safe;
    }

    async upload(localPath: string, filename: string): Promise<string> {
        const safeFilename = this.sanitizeFilename(filename);
        const dest = resolve(this.basePath, safeFilename);
        await pipeline(createReadStream(localPath), createWriteStream(dest));
        log.debug(`Local upload: ${dest}`);
        return dest;
    }

    async download(filename: string, localPath: string): Promise<void> {
        const safeFilename = this.sanitizeFilename(filename);
        const src = resolve(this.basePath, safeFilename);
        await pipeline(createReadStream(src), createWriteStream(localPath));
    }

    async delete(filename: string): Promise<void> {
        const safeFilename = this.sanitizeFilename(filename);
        const filePath = resolve(this.basePath, safeFilename);
        if (existsSync(filePath)) unlinkSync(filePath);
    }

    async exists(filename: string): Promise<boolean> {
        const safeFilename = this.sanitizeFilename(filename);
        return existsSync(resolve(this.basePath, safeFilename));
    }

    async list(): Promise<string[]> {
        return readdirSync(this.basePath).filter(f => f.endsWith('.tar.gz'));
    }

    async getSize(filename: string): Promise<number> {
        const safeFilename = this.sanitizeFilename(filename);
        const filePath = resolve(this.basePath, safeFilename);
        return existsSync(filePath) ? statSync(filePath).size : 0;
    }
}

// S3 Storage
class S3Storage implements StorageBackend {
    private getConfig() {
        return {
            endpoint: settingsRepo.get('s3_endpoint'),
            bucket: settingsRepo.get('s3_bucket'),
            region: settingsRepo.get('s3_region'),
            accessKey: settingsRepo.get('s3_access_key'),
            secretKey: settingsRepo.get('s3_secret_key'),
        };
    }

    private getClient() {
        const conf = this.getConfig();
        if (!conf.bucket || !conf.accessKey) throw new Error("S3 Configuration missing in database");

        // Normalize endpoint URL (auto-add https:// if missing)
        let endpoint = conf.endpoint;
        if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
            endpoint = `https://${endpoint}`;
        }

        return new S3Client({
            endpoint: endpoint || undefined,
            region: conf.region || 'us-east-1',
            credentials: { accessKeyId: conf.accessKey, secretAccessKey: conf.secretKey! },
            forcePathStyle: true,
        });
    }

    async upload(localPath: string, filename: string): Promise<string> {
        const conf = this.getConfig();
        if (!conf.bucket) throw new Error("S3 Bucket not configured");
        const upload = new Upload({
            client: this.getClient(),
            params: { Bucket: conf.bucket, Key: filename, Body: createReadStream(localPath) },
        });
        await upload.done();
        log.debug(`S3 upload: ${filename}`);
        return `s3://${conf.bucket}/${filename}`;
    }

    async download(filename: string, localPath: string): Promise<void> {
        const conf = this.getConfig();
        if (!conf.bucket) throw new Error("S3 Bucket not configured");
        const { Body } = await this.getClient().send(new GetObjectCommand({ Bucket: conf.bucket, Key: filename }));
        if (Body) await pipeline(Body as any, createWriteStream(localPath));
    }

    async delete(filename: string): Promise<void> {
        const conf = this.getConfig();
        if (!conf.bucket) return;
        await this.getClient().send(new DeleteObjectCommand({ Bucket: conf.bucket, Key: filename }));
    }

    async exists(filename: string): Promise<boolean> {
        const conf = this.getConfig();
        if (!conf.bucket) return false;
        try {
            await this.getClient().send(new HeadObjectCommand({ Bucket: conf.bucket, Key: filename }));
            return true;
        } catch { return false; }
    }

    async list(): Promise<string[]> {
        const conf = this.getConfig();
        if (!conf.bucket) return [];
        try {
            const { Contents } = await this.getClient().send(new ListObjectsV2Command({ Bucket: conf.bucket }));
            return (Contents || []).map(o => o.Key!).filter(k => k.endsWith('.tar.gz'));
        } catch { return []; }
    }

    async getSize(filename: string): Promise<number> {
        const conf = this.getConfig();
        try {
            const { ContentLength } = await this.getClient().send(new HeadObjectCommand({ Bucket: conf.bucket, Key: filename }));
            return ContentLength || 0;
        } catch { return 0; }
    }
}

// SFTP Storage
class SftpStorage implements StorageBackend {
    private async getClient(): Promise<SftpClient> {
        const client = new SftpClient();
        const host = settingsRepo.get('sftp_host');
        const port = Number(settingsRepo.get('sftp_port')) || 22;
        const username = settingsRepo.get('sftp_user');
        const password = settingsRepo.get('sftp_pass');

        if (!host || !username) throw new Error("SFTP Configuration missing in database");

        await client.connect({
            host, port, username,
            password: password || undefined,
        });
        return client;
    }

    private getPath() {
        return settingsRepo.get('sftp_path') || '/';
    }

    async upload(localPath: string, filename: string): Promise<string> {
        const client = await this.getClient();
        try {
            const remotePath = `${this.getPath()}/${filename}`;
            const remoteDir = this.getPath();

            // Ensure remote directory exists
            if (!await client.exists(remoteDir)) {
                await client.mkdir(remoteDir, true);
            }

            await client.fastPut(localPath, remotePath);
            log.debug(`SFTP upload: ${remotePath}`);
            return remotePath;
        } finally { await client.end(); }
    }

    async download(filename: string, localPath: string): Promise<void> {
        const client = await this.getClient();
        try {
            await client.fastGet(`${this.getPath()}/${filename}`, localPath);
        } finally { await client.end(); }
    }

    async delete(filename: string): Promise<void> {
        const client = await this.getClient();
        try {
            await client.delete(`${this.getPath()}/${filename}`);
        } finally { await client.end(); }
    }

    async exists(filename: string): Promise<boolean> {
        const client = await this.getClient();
        try {
            return await client.exists(`${this.getPath()}/${filename}`) !== false;
        } finally { await client.end(); }
    }

    async list(): Promise<string[]> {
        const client = await this.getClient();
        try {
            const files = await client.list(this.getPath());
            return files.filter((f: any) => f.name.endsWith('.tar.gz')).map((f: any) => f.name);
        } catch { return []; }
        finally { await client.end(); }
    }

    async getSize(filename: string): Promise<number> {
        const client = await this.getClient();
        try {
            const stat = await client.stat(`${this.getPath()}/${filename}`);
            return stat.size;
        } catch { return 0; }
        finally { await client.end(); }
    }
}

// Storage Manager
const backends: Record<StorageType, StorageBackend> = {
    local: new LocalStorage(),
    cloud: new S3Storage(),
    remote: new SftpStorage(),
};

export const storage = {
    get: (type: StorageType): StorageBackend => backends[type],
    isConfigured: (type: StorageType): boolean => {
        if (type === 'local') return true;
        if (type === 'cloud') {
            const bucket = settingsRepo.get('s3_bucket');
            const key = settingsRepo.get('s3_access_key');
            return !!(bucket && key);
        }
        if (type === 'remote') {
            const host = settingsRepo.get('sftp_host');
            const user = settingsRepo.get('sftp_user');
            return !!(host && user);
        }
        return false;
    },
};
