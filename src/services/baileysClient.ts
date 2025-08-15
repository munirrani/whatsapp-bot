import makeWASocket, { downloadMediaMessage, DisconnectReason, WASocket, proto, useMultiFileAuthState, AnyMessageContent } from 'baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { logger } from '../utils/logger';
import { config } from '../config';
import { databaseService } from './databaseService';

export const initBaileys = async (): Promise<void> => {
    await startBaileys();
};

let sock: WASocket | undefined;

async function startBaileys(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(config.baileysAuthDir);

    sock = makeWASocket({
        auth: state,
        logger: logger,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const shouldReconnect = lastDisconnect && (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (connection === 'close' && shouldReconnect) {
            logger.info('Baileys connection closed, attempting to reconnect...');
            startBaileys();
        } else if (connection === 'open') {
            logger.info('Baileys connection opened');
        }
        if (qr) {
            console.log(await QRCode.toString(qr, { type: 'terminal' }))
        }
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
        if (!sock) {
            logger.error('Baileys socket is not initialized. Cannot handle messages.');
            return;
        }
        handleIncomingMessage(sock, messages[0]);
    });
}

async function handleIncomingMessage(sock: WASocket, messageObject: proto.IWebMessageInfo) {
    const { key, message } = messageObject;
    const { remoteJid, fromMe, participant } = key;
    const message_id = messageObject.key.id ?? '';

    if (await databaseService.isMessageProcessed(message_id)) {
        return;
    }

    // If the message is a status update, check if the sender is in the whitelist
    if (remoteJid === 'status@broadcast' && !fromMe) {
        const senderJid = participant;
        if (!senderJid || !fromMe) {
            return;
        }
    }

    // Save message to database
    const savedMessageId = await databaseService.saveMessage(messageObject);

    // Download and save media if present
    if (savedMessageId && message) {
        const hasMedia = message.imageMessage || message.videoMessage ||
            message.audioMessage || message.documentMessage ||
            message.stickerMessage;

        if (hasMedia) {
            await databaseService.saveMediaAttachment(sock, messageObject, savedMessageId);
        }
    }

    if (!message || !remoteJid) {
        logger.warn('Received message without content or remoteJid:', messageObject);
        return;
    }

    let text: string = '';
    const messageTypes = Object.keys(message).filter(key => key.endsWith('Message'));

    if (messageTypes.length === 0 && message.hasOwnProperty('conversation')) {
        text = message.conversation || '';
    } else {
        for (const messageType of messageTypes) {
            if (messageType === "conversation") {
                text = message.conversation || '';
                break;
            } else if (messageType === "extendedTextMessage") {
                text = message.extendedTextMessage?.text || '';
                break;
            } else if (messageType === "imageMessage") {
                text = message.imageMessage?.caption || '';
                break;
            } else if (messageType === "videoMessage") {
                text = message.videoMessage?.caption || '';
                break;
            } else if (messageType === "documentMessage") {
                text = message.documentMessage?.caption || '';
                break;
            }
        }
    }
}

export const getBaileysSocket = (): WASocket | undefined => {
    if (!sock) {
        logger.error('Baileys socket is not initialized. Please call initBaileys first.');
        return undefined;
    }
    return sock;
}

export const sendWhatsAppStatus = async (
    messagePayload: AnyMessageContent,
    statusPayload: { backgroundColor?: string; font?: number; statusJidList?: string[] }
): Promise<void> => {
    if (!sock) {
        throw new Error('Baileys socket is not initialized.');
    }
    await sock.sendMessage("status@broadcast", messagePayload, statusPayload);
};
