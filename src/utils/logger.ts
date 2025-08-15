import pino, { Logger } from 'pino';

export const logger: Logger = pino({ level: 'info' }); // Or 'info', 'debug' based on need
