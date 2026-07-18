import { createApp } from './app';
import { initializeDatabases, closeDatabases } from './services/database';
import { logger } from './utils/logger';

const port = Number(process.env.PORT || process.env.LEXPLAN_PORT || 3000);

async function main(): Promise<void> {
  await initializeDatabases();
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info(`LexPlan backend listening on http://127.0.0.1:${port}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}; shutting down LexPlan backend.`);
    server.close(async () => {
      await closeDatabases();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Failed to start LexPlan backend', error);
  process.exit(1);
});