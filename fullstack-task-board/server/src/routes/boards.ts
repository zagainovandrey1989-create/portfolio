import { Router } from 'express';
import { NotFoundError } from '../errors.js';
import type { TaskBoardRepository } from '../repository.js';
import { createBoardSchema, createTaskSchema, idSchema, taskFilterSchema, updateBoardSchema } from '../schemas.js';

export function boardsRouter(repo: TaskBoardRepository): Router {
  const router = Router();

  const requireBoard = (rawId: unknown) => {
    const id = idSchema.parse(rawId);
    const board = repo.getBoard(id);
    if (!board) throw new NotFoundError('Board', id);
    return board;
  };

  router.get('/', (_req, res) => {
    res.json({ data: repo.listBoards() });
  });

  router.post('/', (req, res) => {
    const { name } = createBoardSchema.parse(req.body);
    const board = repo.createBoard(name);
    req.log.info({ boardId: board.id }, 'board created');
    res.status(201).location(`/api/boards/${board.id}`).json({ data: board });
  });

  router.get('/:boardId', (req, res) => {
    res.json({ data: requireBoard(req.params.boardId) });
  });

  router.patch('/:boardId', (req, res) => {
    const board = requireBoard(req.params.boardId);
    const { name } = updateBoardSchema.parse(req.body);
    res.json({ data: repo.updateBoard(board.id, name) });
  });

  router.delete('/:boardId', (req, res) => {
    const board = requireBoard(req.params.boardId);
    repo.deleteBoard(board.id);
    req.log.info({ boardId: board.id }, 'board deleted');
    res.status(204).end();
  });

  router.get('/:boardId/tasks', (req, res) => {
    const board = requireBoard(req.params.boardId);
    const filter = taskFilterSchema.parse(req.query);
    res.json({ data: repo.listTasks(board.id, filter) });
  });

  router.post('/:boardId/tasks', (req, res) => {
    const board = requireBoard(req.params.boardId);
    const input = createTaskSchema.parse(req.body);
    const task = repo.createTask(board.id, input);
    req.log.info({ boardId: board.id, taskId: task.id }, 'task created');
    res.status(201).location(`/api/tasks/${task.id}`).json({ data: task });
  });

  router.get('/:boardId/assignees', (req, res) => {
    const board = requireBoard(req.params.boardId);
    res.json({ data: repo.listAssignees(board.id) });
  });

  return router;
}
