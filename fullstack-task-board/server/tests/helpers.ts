import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { createLogger } from '../src/logger.js';
import { TaskBoardRepository } from '../src/repository.js';

export function setup(options: { staticDir?: string } = {}) {
  const db = openDatabase(':memory:');
  const repo = new TaskBoardRepository(db);
  const app = createApp({ repo, logger: createLogger('silent'), staticDir: options.staticDir });
  const api = request(app);

  const createBoard = async (name = 'Test board') => {
    const res = await api.post('/api/boards').send({ name }).expect(201);
    return res.body.data as { id: number; name: string };
  };

  const createTask = async (boardId: number, body: Record<string, unknown>) => {
    const res = await api.post(`/api/boards/${boardId}/tasks`).send(body).expect(201);
    return res.body.data as {
      id: number;
      title: string;
      status: string;
      position: number;
      assignee: string | null;
    };
  };

  return { db, repo, app, api, createBoard, createTask };
}
