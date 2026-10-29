import { expect, test } from '../../fixtures/test';
import { uniqueName } from '../../helpers/data';
import type { ApiErrorBody, Board } from '../../helpers/types';

test.describe('Boards REST API', () => {
  test('health check responds', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers()['x-request-id']).toBeTruthy();
  });

  test('creates, renames and deletes a board (cascading to its tasks)', async ({ request, api }, testInfo) => {
    const name = uniqueName('API board', testInfo);
    const created = await request.post('/api/boards', { data: { name } });
    expect(created.status()).toBe(201);
    const board = (await created.json()).data as Board;

    const listed = (await (await request.get('/api/boards')).json()).data as Board[];
    expect(listed.map((b) => b.id)).toContain(board.id);

    const renamed = await request.patch(`/api/boards/${board.id}`, { data: { name: `${name} (renamed)` } });
    expect(((await renamed.json()).data as Board).name).toBe(`${name} (renamed)`);

    const task = await api.createTask(board.id, { title: 'Will be removed with the board' });

    expect((await request.delete(`/api/boards/${board.id}`)).status()).toBe(204);
    expect((await request.get(`/api/boards/${board.id}`)).status()).toBe(404);
    expect((await request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
  });

  test('rejects invalid board payloads', async ({ request }) => {
    const empty = await request.post('/api/boards', { data: { name: '   ' } });
    expect(empty.status()).toBe(400);
    expect(((await empty.json()) as ApiErrorBody).error.details).toEqual([
      { path: 'name', message: 'Name is required' },
    ]);

    const malformed = await request.post('/api/boards', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"name":',
    });
    expect(malformed.status()).toBe(400);
    expect(((await malformed.json()) as ApiErrorBody).error.code).toBe('INVALID_JSON');
  });
});
