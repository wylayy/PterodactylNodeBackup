import axios from 'axios';
import { settingsRepo } from './db.js';
import { log } from './logger.js';

interface PteroConfig {
    url: string;
    key: string;
}

function getConfig(): PteroConfig | null {
    const url = settingsRepo.get('ptero_url');
    const key = settingsRepo.get('ptero_key');
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key };
}

export async function getServerState(uuid: string): Promise<string | null> {
    const conf = getConfig();
    if (!conf) return null;

    try {
        const res = await axios.get(`${conf.url}/api/client/servers/${uuid}/resources`, {
            headers: {
                'Authorization': `Bearer ${conf.key}`,
                'Accept': 'application/json',
            },
        });
        return res.data.attributes.current_state; // running, offline, starting, stopping
    } catch (err: any) {
        // If 404, server doesn't exist or no access
        if (err.response?.status === 404) return null;
        log.warn(`Pterodactyl API error (Status): ${err.message}`);
        return null;
    }
}

export async function setServerState(uuid: string, signal: 'start' | 'stop' | 'restart' | 'kill'): Promise<boolean> {
    const conf = getConfig();
    if (!conf) return false;

    try {
        await axios.post(`${conf.url}/api/client/servers/${uuid}/power`, { signal }, {
            headers: {
                'Authorization': `Bearer ${conf.key}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
        return true;
    } catch (err: any) {
        log.warn(`Pterodactyl API error (Power ${signal}): ${err.message}`);
        return false;
    }
}
