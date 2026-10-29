import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

describe('tasks API', () => {
  it('creates a task with defaults', async () => {
    const { api, createBoard } = setup();
    const board = await createBoard();
    const res = await api.post(`/api/boards/${board.id}/tasks`).send({ title: 'Write docs' }).expect(201);
    expect(res.body.data).toMatchObject({
      boardId: board.id,
      title: 'Write docs',
      description: '',
      assignee: null,
      status: 'todo',
      position: 0,
    });
    expect(res.headers.location).toBe(`/api/tasks/${res.body.data.id}`);
  });

  it('normalises a blank assignee to null', async () => {
    const { createBoard, createTask } = setup();
    const board = await createBoard();
    const task = await createTask(board.id, { title: 'A', assignee: '   ' });
    expect(task.assignee).toBeNull();
  });

  it('validates task input', async () => {
    const { api, createBoard } = setup();
    const board = await createBoard();

    const missing = await api.post(`/api/boards/${board.id}/tasks`).send({}).expect(400);
    expect(missing.body.error.details).toContainEqual({ path: 'title', message: 'Title is required' });

    const tooLong = await api
      .post(`/api/boards/${board.id}/tasks`)
      .send({ title: 'x'.repeat(201) })
      .expect(400);
    expect(tooLong.body.error.details[0].message).toBe('Title must be at most 200 characters');

    const badStatus = await api
      .post(`/api/boards/${board.id}/tasks`)
      .send({ title: 'ok', status: 'blocked' })
      .expect(400);
    expect(badStatus.body.error.details[0].path).toBe('status');
  });

  it('returns 404 when creating a task on a missing board', async () => {
    const { api } = setup();
    await api.post('/api/boards/42/tasks').send({ title: 'x' }).expect(404);
  });

  it('reads, updates and deletes a task', async () => {
    const { api, createBoard, createTask } = setup();
    const board = await createBoard();
    const task = await createTask(board.id, { title: 'Draft' });

    await api.get(`/api/tasks/${task.id}`).expect(200);

    const updated = await api
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'Final', description: 'Ready', assignee: 'alice' })
      .expect(200);
    expect(updated.body.data).toMatchObject({ title: 'Final', description: 'Ready', assignee: 'alice' });

    const unassigned = await api.patch(`/api/tasks/${task.id}`).send({ assignee: null }).expect(200);
    expect(unassigned.body.data.assignee).toBeNull();

    await api.delete(`/api/tasks/${task.id}`).expect(204);
    await api.get(`/api/tasks/${task.id}`).expect(404);
    await api.delete(`/api/tasks/${task.id}`).expect(404);
  });

  it('rejects an empty update', async () => {
    const { api, createBoard, createTask } = setup();
    const board = await createBoard();
    const task = await createTask(board.id, { title: 'x' });
    const res = await api.patch(`/api/tasks/${task.id}`).send({}).expect(400);
    expect(res.body.error.details[0].message).toBe('At least one field must be provided');
  });

  it('changing status via PATCH appends the task to the target column', async () => {
    const { api, createBoard, createTask } = setup();
    const board = await createBoard();
    await createTask(board.id, { title: 'done-1', status: 'done' });
    const task = await createTask(board.id, { title: 'todo-1' });
    const res = await api.patch(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'done', position: 1 });
  });

  describe('move', () => {
    it('moves a task to another column, closing the gap it leaves', async () => {
      const { api, createBoard, createTask } = setup();
      const board = await createBoard();
      const a = await createTask(board.id, { title: 'a' });
      const b = await createTask(board.id, { title: 'b' });
      const c = await createTask(board.id, { title: 'c' });

      const moved = await api.post(`/api/tasks/${a.id}/move`).send({ status: 'in_progress' }).expect(200);
      expect(moved.body.data).toMatchObject({ status: 'in_progress', position: 0 });

      const todo = await api.get(`/api/boards/${board.id}/tasks?status=todo`).expect(200);
      expect(todo.body.data.map((t: { id: number; position: number }) => [t.id, t.position])).toEqual([
        [b.id, 0],
        [c.id, 1],
      ]);
    });

    it('inserts at a given position and clamps out-of-range positions', async () => {
      const { api, createBoard, createTask } = setup();
      const board = await createBoard();
      const x = await createTask(board.id, { title: 'x', status: 'done' });
      const y = await createTask(board.id, { title: 'y', status: 'done' });
      const t = await createTask(board.id, { title: 't' });

      await api.post(`/api/tasks/${t.id}/move`).send({ status: 'done', position: 1 }).expect(200);
      let done = await api.get(`/api/boards/${board.id}/tasks?status=done`);
      expect(done.body.data.map((task: { id: number }) => task.id)).toEqual([x.id, t.id, y.id]);

      await api.post(`/api/tasks/${x.id}/move`).send({ status: 'done', position: 99 }).expect(200);
      done = await api.get(`/api/boards/${board.id}/tasks?status=done`);
      expect(done.body.data.map((task: { id: number; position: number }) => [task.id, task.position])).toEqual([
        [t.id, 0],
        [y.id, 1],
        [x.id, 2],
      ]);
    });

    it('validates the move payload', async () => {
      const { api, createBoard, createTask } = setup();
      const board = await createBoard();
      const task = await createTask(board.id, { title: 't' });
      await api.post(`/api/tasks/${task.id}/move`).send({ status: 'archived' }).expect(400);
      await api.post(`/api/tasks/${task.id}/move`).send({ status: 'done', position: -1 }).expect(400);
      await api.post('/api/tasks/999/move').send({ status: 'done' }).expect(404);
    });
  });

  describe('filtering', () => {
    it('filters by assignee (case-insensitive) and status', async () => {
      const { api, createBoard, createTask } = setup();
      const board = await createBoard();
      await createTask(board.id, { title: 'a1', assignee: 'Alice' });
      await createTask(board.id, { title: 'a2', assignee: 'alice', status: 'done' });
      await createTask(board.id, { title: 'b1', assignee: 'Bob' });

      const alice = await api.get(`/api/boards/${board.id}/tasks?assignee=ALICE`).expect(200);
      expect(alice.body.data.map((t: { title: string }) => t.title)).toEqual(['a1', 'a2']);

      const aliceDone = await api.get(`/api/boards/${board.id}/tasks?assignee=alice&status=done`).expect(200);
      expect(aliceDone.body.data.map((t: { title: string }) => t.title)).toEqual(['a2']);

      await api.get(`/api/boards/${board.id}/tasks?status=nope`).expect(400);
    });

    it('lists distinct assignees for a board', async () => {
      const { api, createBoard, createTask } = setup();
      const board = await createBoard();
      await createTask(board.id, { title: '1', assignee: 'bob' });
      await createTask(board.id, { title: '2', assignee: 'Alice' });
      await createTask(board.id, { title: '3', assignee: 'bob' });
      await createTask(board.id, { title: '4' });
      const res = await api.get(`/api/boards/${board.id}/assignees`).expect(200);
      expect(res.body.data).toEqual(['Alice', 'bob']);
    });

    it('keeps tasks of different boards apart', async () => {
      const { api, createBoard, createTask } = setup();
      const one = await createBoard('one');
      const two = await createBoard('two');
      await createTask(one.id, { title: 'only on one' });
      const res = await api.get(`/api/boards/${two.id}/tasks`).expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  it('closes the position gap on delete', async () => {
    const { api, createBoard, createTask } = setup();
    const board = await createBoard();
    const a = await createTask(board.id, { title: 'a' });
    const b = await createTask(board.id, { title: 'b' });
    await api.delete(`/api/tasks/${a.id}`).expect(204);
    const res = await api.get(`/api/tasks/${b.id}`).expect(200);
    expect(res.body.data.position).toBe(0);
  });
});
