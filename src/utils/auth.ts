import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.get('X-API-Key');
    if (apiKey !== config.apiKey) {
        res.status(403).json({ error: 'Invalid API Key' });
    } else {
        next();
    }
};
