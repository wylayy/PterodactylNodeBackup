import { log } from './logger.js';
import { settingsRepo } from './db.js';

type WebhookType = 'success' | 'error' | 'warning' | 'info';

const COLORS: Record<WebhookType, number> = {
    success: 0x22c55e,
    error: 0xef4444,
    warning: 0xf59e0b,
    info: 0x3b82f6,
};

export async function sendWebhook(
    type: WebhookType,
    title: string,
    description: string,
    fields?: { name: string; value: string; inline?: boolean }[]
): Promise<void> {
    const webhookUrl = settingsRepo.get('discord_webhook_url');
    if (!webhookUrl) return;

    try {
        const icons: Record<WebhookType, string> = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const embed = {
            title: `${icons[type]} ${title}`,
            description: description,
            color: COLORS[type],
            fields: fields || [],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Pterodactyl Backup System',
                icon_url: 'https://cdn.pterodactyl.io/logos/new/pterodactyl_logo_transparent.png'
            },
            author: {
                name: 'Backup Notification',
            }
        };

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });

        log.debug(`Webhook sent: ${title}`);
    } catch (err) {
        log.error(`Webhook failed: ${err}`);
    }
}
