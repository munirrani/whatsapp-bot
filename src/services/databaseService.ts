import { proto, downloadMediaMessage, WASocket } from 'baileys';
import { database } from '../utils/database';
import { logger } from '../utils/logger';
import { config } from '../config';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface MessageRecord {
    id: string;
    whatsapp_message_id: string;
    chat_jid: string;
    sender_jid: string;
    timestamp: Date;
    message_type: string;
    is_from_me: boolean;
    message_text?: string;
    quoted_message_id?: string;
    reaction_message_id?: string;
    push_name?: string;
    raw_message_data: any;
    is_forwarded: boolean;
}

export interface MediaAttachment {
    message_id: string;
    file_path: string;
    mime_type?: string;
    file_name?: string;
    sha256_hash?: string;
    media_key_data?: Buffer;
}

export class DatabaseService {

    async ensureUserExists(jid: string, pushName?: string): Promise<void> {
        const query = `
            INSERT INTO users (jid, push_name) 
            VALUES ($1, $2) 
            ON CONFLICT (jid) 
            DO UPDATE SET push_name = EXCLUDED.push_name
        `;
        await database.query(query, [jid, pushName]);
    }

    async ensureChatExists(jid: string, name?: string, isGroup: boolean = false): Promise<void> {
        const query = `
            INSERT INTO chats (jid, name, is_group) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (jid) 
            DO UPDATE SET name = EXCLUDED.name
        `;
        await database.query(query, [jid, name, isGroup]);
    }

    async saveMessage(messageObject: proto.IWebMessageInfo): Promise<string | null> {
        const { key, message, pushName, messageTimestamp } = messageObject;

        if (!key || !message || !key.remoteJid || !key.id) {
            logger.warn('Invalid message object, skipping save');
            return null;
        }

        const { remoteJid, fromMe, id: whatsappMessageId } = key;
        const senderJid = fromMe ? 'me' : (key.participant || remoteJid);
        const timestamp = new Date((messageTimestamp as number) * 1000);

        try {
            await database.transaction(async (client) => {
                // Ensure user exists
                await client.query(`
                    INSERT INTO users (jid, push_name) 
                    VALUES ($1, $2) 
                    ON CONFLICT (jid) 
                    DO UPDATE SET push_name = EXCLUDED.push_name
                `, [senderJid, pushName]);

                // Ensure chat exists
                const isGroup = remoteJid.includes('@g.us');
                await client.query(`
                    INSERT INTO chats (jid, name, is_group) 
                    VALUES ($1, $2, $3) 
                    ON CONFLICT (jid) 
                    DO NOTHING
                `, [remoteJid, null, isGroup]);

                // Determine message type and extract text
                const messageTypes = Object.keys(message);
                let messageType = 'unknown';
                let messageText = '';
                let quotedMessageId = '';
                let reactionMessageId = '';
                let isForwarded = false;

                if (message.conversation) {
                    messageType = 'text';
                    messageText = message.conversation;
                } else if (message.extendedTextMessage) {
                    messageType = 'text';
                    messageText = message.extendedTextMessage.text || '';
                    quotedMessageId = message.extendedTextMessage.contextInfo?.quotedMessage ?
                        message.extendedTextMessage.contextInfo.stanzaId || '' : '';
                    isForwarded = message.extendedTextMessage.contextInfo?.isForwarded || false;
                } else if (message.imageMessage) {
                    messageType = 'image';
                    messageText = message.imageMessage.caption || '';
                } else if (message.videoMessage) {
                    messageType = 'video';
                    messageText = message.videoMessage.caption || '';
                } else if (message.audioMessage) {
                    messageType = 'audio';
                } else if (message.documentMessage) {
                    messageType = 'document';
                    messageText = message.documentMessage.caption || '';
                } else if (message.stickerMessage) {
                    messageType = 'sticker';
                } else if (message.reactionMessage) {
                    messageType = 'reaction';
                    messageText = message.reactionMessage.text || '';
                    reactionMessageId = message.reactionMessage.key?.id || '';
                }

                // Insert message
                const messageResult = await client.query(`
                    INSERT INTO messages (
                        whatsapp_message_id, 
                        chat_jid, 
                        sender_jid, 
                        timestamp, 
                        message_type, 
                        is_from_me, 
                        message_text, 
                        quoted_message_id, 
                        reaction_message_id, 
                        push_name, 
                        raw_message_data, 
                        is_forwarded
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (chat_jid, whatsapp_message_id) 
                    DO UPDATE SET 
                        message_text = EXCLUDED.message_text,
                        push_name = EXCLUDED.push_name,
                        raw_message_data = EXCLUDED.raw_message_data
                    RETURNING id
                `, [
                    whatsappMessageId,
                    remoteJid,
                    senderJid,
                    timestamp,
                    messageType,
                    fromMe,
                    messageText,
                    quotedMessageId || null,
                    reactionMessageId || null,
                    pushName,
                    JSON.stringify(messageObject),
                    isForwarded
                ]);

                return messageResult.rows[0].id;
            });

            logger.info(`Message from ${senderJid} (${pushName}) in ${remoteJid} saved to database: ${whatsappMessageId}`);
            return whatsappMessageId;
        } catch (error) {
            logger.error('Failed to save message to database:', error);
            return null;
        }
    }

    async saveMediaAttachment(
        sock: WASocket,
        messageObject: proto.IWebMessageInfo,
        messageId: string
    ): Promise<boolean> {
        const { message, key } = messageObject;

        if (!message || !key?.id) {
            return false;
        }

        let mediaMessage: any = null;
        let fileName = '';
        let mimeType = '';

        if (message.imageMessage) {
            mediaMessage = message.imageMessage;
            fileName = `${key.id}.${mediaMessage.mimetype?.split('/')[1] || 'jpg'}`;
            mimeType = mediaMessage.mimetype || 'image/jpeg';
        } else if (message.videoMessage) {
            mediaMessage = message.videoMessage;
            fileName = `${key.id}.${mediaMessage.mimetype?.split('/')[1] || 'mp4'}`;
            mimeType = mediaMessage.mimetype || 'video/mp4';
        } else if (message.audioMessage) {
            mediaMessage = message.audioMessage;
            fileName = `${key.id}.${mediaMessage.mimetype?.split('/')[1] || 'ogg'}`;
            mimeType = mediaMessage.mimetype || 'audio/ogg';
        } else if (message.documentMessage) {
            mediaMessage = message.documentMessage;
            fileName = message.documentMessage.fileName || `${key.id}.pdf`;
            mimeType = mediaMessage.mimetype || 'application/pdf';
        } else if (message.stickerMessage) {
            mediaMessage = message.stickerMessage;
            fileName = `${key.id}.webp`;
            mimeType = 'image/webp';
        }

        if (!mediaMessage) {
            return false;
        }

        try {
            const buffer = await downloadMediaMessage(
                messageObject,
                'buffer',
                {},
                {
                    logger: logger,
                    reuploadRequest: sock.updateMediaMessage
                }
            );

            if (!buffer) {
                logger.warn('Failed to download media for message:', key.id);
                return false;
            }

            const filePath = path.join(config.mediaDir, fileName);
            fs.writeFileSync(filePath, buffer);

            const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');
            const mediaKeyData = mediaMessage.mediaKey ? Buffer.from(mediaMessage.mediaKey) : null;

            // Get message database ID
            const messageResult = await database.query(
                'SELECT id FROM messages WHERE whatsapp_message_id = $1',
                [key.id]
            );

            if (messageResult.rows.length === 0) {
                logger.warn('Message not found in database for media attachment:', key.id);
                return false;
            }

            const dbMessageId = messageResult.rows[0].id;

            await database.query(`
                INSERT INTO media_attachments (
                    message_id, 
                    file_path, 
                    mime_type, 
                    file_name, 
                    sha256_hash, 
                    media_key_data
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (message_id, file_path) 
                DO UPDATE SET 
                    mime_type = EXCLUDED.mime_type,
                    file_name = EXCLUDED.file_name,
                    sha256_hash = EXCLUDED.sha256_hash
            `, [
                dbMessageId,
                filePath,
                mimeType,
                fileName,
                sha256Hash,
                mediaKeyData
            ]);

            logger.info(`Media attachment saved: ${filePath}`);
            return true;
        } catch (error) {
            logger.error('Failed to save media attachment:', error);
            return false;
        }
    }

    async isMessageProcessed(messageId: string): Promise<boolean> {
        try {
            const result = await database.query(
                'SELECT 1 FROM messages WHERE whatsapp_message_id = $1',
                [messageId]
            );
            return result.rows.length > 0;
        } catch (error) {
            logger.error('Failed to check if message is processed:', error);
            return false;
        }
    }

    async getMessagesByChat(chatJid: string, limit: number = 50, offset: number = 0): Promise<MessageRecord[]> {
        try {
            const result = await database.query(`
                SELECT * FROM messages 
                WHERE chat_jid = $1 
                ORDER BY timestamp DESC 
                LIMIT $2 OFFSET $3
            `, [chatJid, limit, offset]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get messages by chat:', error);
            return [];
        }
    }

    async searchMessages(searchTerm: string, limit: number = 50): Promise<MessageRecord[]> {
        try {
            const result = await database.query(`
                SELECT * FROM messages 
                WHERE search_vector @@ plainto_tsquery('english', $1)
                ORDER BY timestamp DESC 
                LIMIT $2
            `, [searchTerm, limit]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to search messages:', error);
            return [];
        }
    }

    async fetchLatestStatusText(): Promise<string | null> {
        try {
            const result = await database.query(`
                SELECT message_text 
                FROM messages 
                WHERE chat_jid = 'status@broadcast' 
                AND is_from_me = true 
                AND message_text IS NOT NULL 
                AND message_text != ''
                ORDER BY timestamp DESC 
                LIMIT 1
            `);

            if (result.rows.length > 0) {
                return result.rows[0].message_text;
            }
            return null;
        } catch (error) {
            logger.error('Failed to fetch latest status text:', error);
            return null;
        }
    }

    async getGroupMap(): Promise<Record<string, string[]>> {
        try {
            const result = await database.query(`
                SELECT jid, name FROM chats WHERE is_group = true
            `);
            const groupMap: Record<string, string[]> = {
                'All Contacts': ["0123456789@s.whatsapp.net"],
                'Family': [],
                'Friends': [],
            };
            for (const row of result.rows) {
                groupMap[row.name] = [row.jid];
            }
            return groupMap;
        } catch (error) {
            logger.error('Failed to get group map:', error);
            return {};
        }
    }
}

export const databaseService = new DatabaseService();