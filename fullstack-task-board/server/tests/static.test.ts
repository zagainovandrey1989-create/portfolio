import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { setup } from './helpers.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-board-static-'));
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Task Board</title>');
fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("app")');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('static web app hosting', () => {
  it('serves assets and falls back to index.html for client routes', async () => {
    const { api } = setup({ staticDir: dir });
    const asset = await api.get('/app.js').expect(200);
    expect(asset.text).toContain('console.log');

    const shell = await api.get('/boards/1').expect(200);
    expect(shell.headers['content-type']).toContain('text/html');
    expect(shell.text).toContain('<title>Task Board</title>');
  });

  it('still returns JSON 404 for unknown API routes', async () => {
    const { api } = setup({ staticDir: dir });
    const res = await api.get('/api/unknown').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('config', () => {
  it('uses sensible defaults and points static hosting at the web build', () => {
    const defaults = loadConfig({});
    expect(defaults).toMatchObject({ port: 3001, isProduction: false });
    expect(defaults.staticDir).toMatch(/web[\\/]dist$/);
    expect(defaults.databasePath).toMatch(/task-board\.db$/);

    const prod = loadConfig({ NODE_ENV: 'production', PORT: '8080', DATABASE_PATH: ':memory:', STATIC_DIR: '/srv/www' });
    expect(prod).toMatchObject({ port: 8080, isProduction: true, databasePath: ':memory:', staticDir: '/srv/www' });
  });

  it('can disable static hosting', () => {
    expect(loadConfig({ SERVE_STATIC: 'false' }).staticDir).toBeUndefined();
  });

  it('does not mount static hosting when the build is missing', async () => {
    const { api } = setup({ staticDir: path.join(dir, 'missing') });
    await api.get('/').expect(404);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow('Invalid PORT');
  });
});
