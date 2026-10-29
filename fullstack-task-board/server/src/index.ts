import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createLogger } from './logger.js';
import { TaskBoardRepository } from './repository.js';

const logger = createLogger();
const config = loadConfig();

const db = openDatabase(config.databasePath);
const repo = new TaskBoardRepository(db);
const app = createApp({ repo, logger, staticDir: config.staticDir });

const server = app.listen(config.port, config.host, () => {
  logger.info(
    { port: config.port, database: config.databasePath, staticDir: config.staticDir ?? null },
    'task board server listening',
  );
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection');
});
