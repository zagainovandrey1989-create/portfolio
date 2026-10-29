import { expect, test } from '../../fixtures/test';
import type { ApiErrorBody, Task } from '../../helpers/types';

test.describe('Tasks REST API', () => {
  test('full task lifecycle: create, read, update, move, delete', async ({ request, board }) => {
    const created = await request.post(`/api/boards/${board.id}/tasks`, {
      data: { title: '  API task  ', assignee: 'erin' },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()['content-type']).toContain('application/json');
    const task = (await created.json()).data as Task;
    expect(task).toMatchObject({ boardId: board.id, title: 'API task', assignee: 'erin', status: 'todo', position: 0 });
    expect(created.headers()['location']).toBe(`/api/tasks/${task.id}`);

    const read = await request.get(`/api/tasks/${task.id}`);
    expect(read.ok()).toBeTruthy();

    const updated = await request.patch(`/api/tasks/${task.id}`, { data: { description: 'via API' } });
    expect((await updated.json()).data).toMatchObject({ description: 'via API', title: 'API task' });

    const moved = await request.post(`/api/tasks/${task.id}/move`, { data: { status: 'done' } });
    expect((await moved.json()).data).toMatchObject({ status: 'done', position: 0 });

    const deleted = await request.delete(`/api/tasks/${task.id}`);
    expect(deleted.status()).toBe(204);
    expect((await request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
  });

  test('returns structured validation errors', async ({ request, board }) => {
    const response = await request.post(`/api/boards/${board.id}/tasks`, {
      data: { title: '', status: 'blocked', extra: true },
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'title', message: 'Title is required' },
        expect.objectContaining({ path: 'status' }),
      ]),
    );
  });

  test('returns 404 for unknown boards and tasks', async ({ request }) => {
    const board = await request.get('/api/boards/999999');
    expect(board.status()).toBe(404);
    expect(((await board.json()) as ApiErrorBody).error).toEqual({
      code: 'NOT_FOUND',
      message: 'Board 999999 not found',
    });
    expect((await request.post('/api/tasks/999999/move', { data: { status: 'done' } })).status()).toBe(404);
  });

  test('filters tasks by assignee and status', async ({ api, board }) => {
    await api.createTasks(board.id, [
      { title: 'f1', assignee: 'Frank' },
      { title: 'f2', assignee: 'frank', status: 'done' },
      { title: 'g1', assignee: 'grace' },
    ]);

    const frank = await api.listTasks(board.id, { assignee: 'FRANK' });
    expect(frank.map((task) => task.title)).toEqual(['f1', 'f2']);

    const frankDone = await api.listTasks(board.id, { assignee: 'frank', status: 'done' });
    expect(frankDone.map((task) => task.title)).toEqual(['f2']);
  });

  test('keeps column positions dense when moving to a specific index', async ({ api, board }) => {
    const [a, b, c] = await api.createTasks(board.id, [
      { title: 'a', status: 'in_progress' },
      { title: 'b', status: 'in_progress' },
      { title: 'c' },
    ]);

    await api.moveTask(c!.id, 'in_progress', 0);

    const column = await api.listTasks(board.id, { status: 'in_progress' });
    expect(column.map((task) => [task.id, task.position])).toEqual([
      [c!.id, 0],
      [a!.id, 1],
      [b!.id, 2],
    ]);
  });
});
