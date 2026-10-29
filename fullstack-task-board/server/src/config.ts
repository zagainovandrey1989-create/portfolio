import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  isProduction: boolean;
  staticDir: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  // dist/index.js (or src/index.ts) -> ../../web/dist
  const defaultStaticDir = path.resolve(import.meta.dirname, '../../web/dist');
  // The built web app is served whenever it exists (so `npm start` after `npm run build`
  // runs everything in one process). Set SERVE_STATIC=false to run the API only.
  const serveStatic = env.SERVE_STATIC !== 'false';
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    databasePath: env.DATABASE_PATH ?? path.resolve(import.meta.dirname, '../data/task-board.db'),
    isProduction,
    staticDir: serveStatic ? (env.STATIC_DIR ?? defaultStaticDir) : undefined,
  };
}
