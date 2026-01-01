import { startServer } from './api.js';
import { log } from './logger.js';

log.info('Starting Pterodactyl Backup System...');
startServer();
