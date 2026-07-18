import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import legalStudyRoutes from './routes/legal-study.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '25mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lexplan-backend', timestamp: new Date().toISOString() });
  });
  app.use('/api/v1/legal-study', legalStudyRoutes);
  app.use('/api/legal-study', legalStudyRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}