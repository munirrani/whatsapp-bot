import express, { Request, Response } from 'express';
import https from 'https';
import http from 'http';
import cors from 'cors'; // Import the cors middleware
import bodyParser from 'body-parser';
import { logger } from '../utils/logger';
import { config } from '../config';
import { apiKeyAuth } from '../utils/auth';
import { upload } from '../utils/fileHandler';
import { defaultJidsAll, getConcatenatedListFromGroupMap } from '../utils/recipientList';
import { sendWhatsAppStatus } from './baileysClient'; // Import Baileys functions
import { databaseService } from './databaseService';

const app = express();
let server: http.Server | https.Server;
// Implement your logic to fetch groups, below is a mock example
let groupMap: Record<string, string[]> = {};

export const startHttpServer = async (): Promise<void> => {
    groupMap = await databaseService.getGroupMap();
    app.use(bodyParser.json());
    app.use(cors()); // Enable CORS for all routes
    app.use('/uploads', express.static(config.uploadDir)); // Serve uploaded files statically

    console.log('Starting HTTP server...');

    app.get("/list", apiKeyAuth, async (req: Request, res: Response) => {
        logger.info('"/list" endpoint invoked');
        const groupMapKeys: string[] = Object.keys(groupMap);
        res.json({
            list: groupMapKeys.map((key) => {
                return { name: key };
            }),
        })
    });

    app.post('/text', apiKeyAuth, async (req: Request, res: Response) => {
        const { message, backgroundColor, selectedRecipientGroup, textColor, fontNumber } = req.body;
        logger.info(`"/text" endpoint Message: "${message}", Background Color: "${backgroundColor}", textColor: "${textColor}", fontNumber: "${fontNumber}", selectedRecipientGroup: ${selectedRecipientGroup?.toString()}`);

        const statusList = getConcatenatedListFromGroupMap(groupMap, selectedRecipientGroup);
        const message_payload = { text: message };
        const status_payload = {
            backgroundColor: backgroundColor ?? '#212121',
            font: fontNumber ?? 3,
            statusJidList: statusList ?? defaultJidsAll
        };

        console.log('Message payload:', message_payload);
        console.log('Status payload:', status_payload);

        try {
            await sendWhatsAppStatus(message_payload, status_payload);
            res.json({ status: `Status sent successfully` });
        } catch (error: any) {
            logger.error('Error sending status:', error);
            res.status(500).json({ error: error.message || 'Failed to send status' });
        }
    });

    
const getMediaType = (mimetype: string, filePath: string): { mediaType: 'image' | 'video' | 'audio', MimeType: string } | null => {
    if (mimetype.includes('image/')) return { mediaType: 'image', MimeType: mimetype };
    if (mimetype.includes('video/')) return { mediaType: 'video', MimeType: mimetype };
    if (mimetype.includes('audio/')) return { mediaType: 'audio', MimeType: mimetype };

    const fileFormat = filePath.split('.').pop()?.toLowerCase();
    if (['mp4', 'mpeg', 'webm'].includes(fileFormat!)) return { mediaType: 'video', MimeType: 'video/mp4' };
    if (['mp3', 'm4a', 'ogg'].includes(fileFormat!)) return { mediaType: 'audio', MimeType: 'audio/mpeg' };

    return null;
}

app.post('/media', apiKeyAuth, upload.single('file'), async (req: Request, res: Response) => {
    const { message, backgroundColor, selectedRecipientGroup } = req.body;
    logger.info(`"/media" endpoint Message: "${message}", Background Color: "${backgroundColor}" for selectedRecipientGroup: ${selectedRecipientGroup?.toString()}`);

    const statusList = getConcatenatedListFromGroupMap(groupMap, JSON.parse(selectedRecipientGroup));
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const { mimetype, path: filePath } = req.file;
    logger.info(`File uploaded: ${filePath}, Mimetype: ${mimetype}`);

    const mediaInfo = getMediaType(mimetype, filePath);

    if (!mediaInfo) {
        const fileFormat = filePath.split('.').pop();
        logger.warn(`Unsupported file type for media message: ${mimetype || fileFormat}`);
        return res.status(400).json({ error: `Unsupported file type: ${mimetype || fileFormat}` });
    }

    const message_payload: any = {
        caption: message,
        [mediaInfo.mediaType]: { url: filePath },
        mimetype: mediaInfo.MimeType
    };

    const status_payload = {
        backgroundColor: backgroundColor ?? '#212121',
        statusJidList: statusList ?? defaultJidsAll
    };

    console.log('Message payload:', message_payload);
    console.log('Status payload:', status_payload);

    try {
        await sendWhatsAppStatus(message_payload, status_payload);
        res.json({
            status: `Status sent successfully`,
            saved_as: filePath
        });
    } catch (error: any) {
        logger.error('Error sending status:', error);
        res.status(500).json({ error: error.message || 'Failed to send status' });
    }
});

    app.get('/latest-status', apiKeyAuth, async (req: Request, res: Response) => {
        logger.info('"/latest-status" endpoint invoked');
        try {
            const latestStatusText = await databaseService.fetchLatestStatusText();
            if (latestStatusText) {
                res.json({ latestStatusText });
            } else {
                res.status(404).json({ error: 'No status found' });
            }
        } catch (error: any) {
            logger.error('Error fetching latest status:', error);
            res.status(500).json({ error: error.message || 'Failed to fetch latest status' });
        }
    });

    if (server && server.listening) {
        logger.info(`HTTP server already listening on port ${config.httpPort}. Skipping re-initialization.`);
        return;
    }

    if (config.sslOptions) {
        server = https.createServer(config.sslOptions, app).listen(config.httpPort, () => {
            logger.info(`Server running on https://localhost:${config.httpPort}`);
        });
    } else {
        server = http.createServer(app).listen(config.httpPort, () => {
            logger.info(`Server running on http://localhost:${config.httpPort}`);
        });
    }

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            logger.error(`Error: Port ${config.httpPort} is already in use by another process. Exiting.`);
            process.exit(1);
        } else {
            logger.error('Server error:', err);
        }
    });
};
