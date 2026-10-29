import type { Board, Task } from '../types';

let nextId = 1;

export function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 1,
    name: 'Product',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? nextId++;
  return {
    id,
    boardId: 1,
    title: `Task ${id}`,
    description: '',
    assignee: null,
    status: 'todo',
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
