import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { apiNotFound, errorHandler } from './errors.js';
import type { Logger } from './logger.js';
import type { TaskBoardRepository } from './repository.js';
import { boardsRouter } from './routes/boards.js';
import { tasksRouter } from './routes/tasks.js';

export interface AppOptions {
  repo: TaskBoardRepository;
  logger: Logger;
  /** Directory with the built web app. When set, it is served with an SPA fallback. */
  staticDir?: string;
}

export function createApp({ repo, logger, staticDir }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/boards', boardsRouter(repo));
  app.use('/api/tasks', tasksRouter(repo));
  app.use('/api', apiNotFound);

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    const indexHtml = path.join(staticDir, 'index.html');
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // SPA fallback: any other GET returns the app shell.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
