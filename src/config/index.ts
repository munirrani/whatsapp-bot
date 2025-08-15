import fs from 'fs';

const httpsEnabled = process.env.HTTPS_ENABLED === 'true';

export const config = {
    httpPort: parseInt(process.env.HTTP_PORT || '8016', 10),
    apiKey: process.env.BAILEY_API_KEY || 'YOUR_SECURE_API_KEY', // Use a default or throw error if not set
    sslOptions: httpsEnabled ? {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.crt')
    } : undefined,
    baileysAuthDir: 'auth_info_baileys',
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'whatsapp',
        user: process.env.DB_USER || 'user',
        password: process.env.DB_PASSWORD || 'password',
        ssl: process.env.DB_SSL === 'true'
    }
};