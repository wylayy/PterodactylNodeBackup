import cron, { ScheduledTask } from 'node-cron';
import { scheduleRepo, nodeRepo, backupRepo } from './db.js';
import { createBackup } from './backup.js';
import { log } from './logger.js';
import { StorageType } from './storage.js';

const jobs = new Map<number, ScheduledTask>();

export function initScheduler(): void {
    const schedules = scheduleRepo.getEnabled();
    for (const schedule of schedules) {
        addJob(schedule);
    }
    log.info(`Loaded ${jobs.size} backup schedules`);
}

export function addJob(schedule: any): void {
    if (jobs.has(schedule.id)) {
        jobs.get(schedule.id)?.stop();
    }

    if (!schedule.enabled) return;

    if (!cron.validate(schedule.cron_expression)) {
        log.warn(`Invalid cron: ${schedule.cron_expression}`);
        return;
    }

    const job = cron.schedule(schedule.cron_expression, async () => {
        log.info(`Running schedule: ${schedule.name}`);
        try {
            await createBackup({
                nodeId: schedule.node_id,
                storageType: schedule.storage_type as StorageType,
            });
            scheduleRepo.update(schedule.id, { last_run: new Date().toISOString() });

            // Apply retention
            applyRetention(schedule.node_id, schedule.storage_type, schedule.retention_count);
        } catch (err) {
            log.error(`Schedule failed: ${err}`);
        }
    });

    jobs.set(schedule.id, job);
    log.debug(`Scheduled: ${schedule.name} (${schedule.cron_expression})`);
}

export function removeJob(id: number): void {
    const job = jobs.get(id);
    if (job) {
        job.stop();
        jobs.delete(id);
    }
}

export function stopScheduler(): void {
    for (const job of jobs.values()) job.stop();
    jobs.clear();
    log.info('Scheduler stopped');
}

function applyRetention(nodeId: number, storageType: string, keep: number): void {
    const backups = backupRepo.getByNode(nodeId)
        .filter((b: any) => b.storage_type === storageType && b.status === 'completed')
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (backups.length > keep) {
        const toDelete = backups.slice(keep);
        for (const backup of toDelete) {
            log.info(`Retention: deleting backup ${backup.id}`);
            backupRepo.delete(backup.id);
        }
    }
}
