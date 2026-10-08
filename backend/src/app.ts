import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiRouter } from './routes/index.js';
import { prisma } from './lib/prisma.js';
import { cloudinaryService } from './services/cloudinary.service.js';
import { aiService } from './services/ai.service.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const corsOrigins = new Set([
  env.FRONTEND_URL,
  ...(env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []),
  ...(env.NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://localhost:4173',
        'http://127.0.0.1:4173',
      ]),
]);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || corsOrigins.has(origin)),
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => env.NODE_ENV === 'test' }));

app.get('/api/health', async (_req, res) => {
  let database = 'unavailable';
  try { await prisma.$queryRaw`SELECT 1`; database = 'connected'; } catch { database = 'unavailable'; }
  res.status(database === 'connected' ? 200 : 503).json({
    status: database === 'connected' ? 'ok' : 'degraded', database,
    services: { cloudinary: cloudinaryService.isConfigured(), ai: { provider: aiService.provider, configured: aiService.isConfigured(), model: aiService.model } },
    timestamp: new Date().toISOString(),
  });
});
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);
