import { logger } from './utils/logger';
import { initBaileys } from './services/baileysClient';
import { startHttpServer } from './services/httpServer';
import { database } from './utils/database';

async function main(): Promise<void> {
    logger.info("Starting Baileys WhatsApp client and servers...");

    // Initialize database connection
    await database.initialize();

    // Initialize Baileys client
    await initBaileys();

    // Start HTTP server (depends on Baileys client being initialized for sending messages)
    await startHttpServer();
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await database.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await database.close();
    process.exit(0);
});

main().catch((error: Error) => {
    logger.error('Error in main function:', error);
    process.exit(1);
});
