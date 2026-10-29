import { Router } from 'express';
import { NotFoundError } from '../errors.js';
import type { TaskBoardRepository } from '../repository.js';
import { idSchema, moveTaskSchema, updateTaskSchema } from '../schemas.js';

export function tasksRouter(repo: TaskBoardRepository): Router {
  const router = Router();

  const parseId = (raw: unknown) => idSchema.parse(raw);

  router.get('/:taskId', (req, res) => {
    const id = parseId(req.params.taskId);
    const task = repo.getTask(id);
    if (!task) throw new NotFoundError('Task', id);
    res.json({ data: task });
  });

  router.patch('/:taskId', (req, res) => {
    const id = parseId(req.params.taskId);
    const input = updateTaskSchema.parse(req.body);
    const task = repo.updateTask(id, input);
    if (!task) throw new NotFoundError('Task', id);
    req.log.info({ taskId: id, fields: Object.keys(input) }, 'task updated');
    res.json({ data: task });
  });

  router.post('/:taskId/move', (req, res) => {
    const id = parseId(req.params.taskId);
    const { status, position } = moveTaskSchema.parse(req.body);
    const task = repo.moveTask(id, status, position);
    if (!task) throw new NotFoundError('Task', id);
    req.log.info({ taskId: id, status: task.status, position: task.position }, 'task moved');
    res.json({ data: task });
  });

  router.delete('/:taskId', (req, res) => {
    const id = parseId(req.params.taskId);
    if (!repo.deleteTask(id)) throw new NotFoundError('Task', id);
    req.log.info({ taskId: id }, 'task deleted');
    res.status(204).end();
  });

  return router;
}
