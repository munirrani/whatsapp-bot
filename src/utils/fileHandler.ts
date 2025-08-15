import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import { config } from '../config';
import { proto } from 'baileys';

interface ReceivedMessages {
    [messageId: string]: boolean;
}

const receivedMessages: ReceivedMessages = {};

export const isMessageProcessed = (messageId: string): boolean => {
    return receivedMessages.hasOwnProperty(messageId) && receivedMessages[messageId];
};

export const markMessageAsProcessed = (messageId: string): void => {
    receivedMessages[messageId] = true;
};

export const writeMessageToFile = async (messageObject: proto.IWebMessageInfo): Promise<void> => {
    const message_id = messageObject.key.id ?? '';
    const file_path = path.join(config.messagesDir, `${message_id}.json`);
    if (messageObject.message) {
        await writeFile(file_path, JSON.stringify(messageObject, null, 2));
        console.log('Message written to file:', file_path);
    }
};

export const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.uploadDir);
    },
    filename: (req, file, cb) => {
        let uniqueFilename = file.originalname;
        let counter = 1;
        while (fs.existsSync(path.join(config.uploadDir, uniqueFilename))) {
            const parsedName = path.parse(file.originalname);
            uniqueFilename = `${parsedName.name}_${counter}${parsedName.ext}`;
            counter++;
        }
        cb(null, uniqueFilename);
    }
});

export const upload = multer({ storage: storage });
