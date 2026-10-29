import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

describe('boards API', () => {
  it('reports health', async () => {
    const { api } = setup();
    await api.get('/api/health').expect(200, { status: 'ok' });
  });

  it('creates, lists, reads, renames and deletes a board', async () => {
    const { api } = setup();

    const created = await api.post('/api/boards').send({ name: '  Sprint 1  ' }).expect(201);
    expect(created.body.data).toMatchObject({ id: expect.any(Number), name: 'Sprint 1' });
    expect(created.headers.location).toBe(`/api/boards/${created.body.data.id}`);
    const id = created.body.data.id as number;

    const list = await api.get('/api/boards').expect(200);
    expect(list.body.data).toHaveLength(1);

    await api.get(`/api/boards/${id}`).expect(200);

    const renamed = await api.patch(`/api/boards/${id}`).send({ name: 'Sprint 2' }).expect(200);
    expect(renamed.body.data.name).toBe('Sprint 2');

    await api.delete(`/api/boards/${id}`).expect(204);
    await api.get(`/api/boards/${id}`).expect(404);
  });

  it('rejects an empty board name with a validation error', async () => {
    const { api } = setup();
    const res = await api.post('/api/boards').send({ name: '   ' }).expect(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'name', message: 'Name is required' }],
    });
  });

  it('rejects unknown fields', async () => {
    const { api } = setup();
    const res = await api.post('/api/boards').send({ name: 'ok', owner: 'x' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-numeric id and 404 for a missing board', async () => {
    const { api } = setup();
    const bad = await api.get('/api/boards/abc').expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const missing = await api.get('/api/boards/999').expect(404);
    expect(missing.body.error).toEqual({ code: 'NOT_FOUND', message: 'Board 999 not found' });
  });

  it('returns 400 for malformed JSON', async () => {
    const { api } = setup();
    const res = await api
      .post('/api/boards')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const { api } = setup();
    const res = await api.get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('echoes or generates a request id', async () => {
    const { api } = setup();
    const echoed = await api.get('/api/health').set('X-Request-Id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await api.get('/api/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('cascades task deletion when a board is deleted', async () => {
    const { api, createBoard, createTask, repo } = setup();
    const board = await createBoard();
    const task = await createTask(board.id, { title: 'Child' });
    await api.delete(`/api/boards/${board.id}`).expect(204);
    expect(repo.getTask(task.id)).toBeUndefined();
  });
});
