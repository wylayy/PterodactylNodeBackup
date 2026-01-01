import winston from 'winston';
import { config } from './config.js';
import { resolve } from 'path';

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
});

export const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), logFormat),
        }),
        new winston.transports.File({
            filename: resolve(config.paths.logs, 'error.log'),
            level: 'error',
        }),
        new winston.transports.File({
            filename: resolve(config.paths.logs, 'combined.log'),
        }),
    ],
});

export const log = {
    info: (msg: string) => logger.info(msg),
    error: (msg: string, err?: unknown) => logger.error(err ? `${msg} ${err}` : msg),
    warn: (msg: string) => logger.warn(msg),
    debug: (msg: string) => logger.debug(msg),
};
