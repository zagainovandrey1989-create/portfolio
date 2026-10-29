import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api } from '../api';
import type { Task } from '../types';
import { makeBoard, makeTask } from './fixtures';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      listBoards: vi.fn(),
      createBoard: vi.fn(),
      listTasks: vi.fn(),
      listAssignees: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      moveTask: vi.fn(),
      deleteTask: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

/** A tiny in-memory backend so the UI can be exercised end to end at component level. */
function useFakeBackend(initialTasks: Task[]) {
  let tasks = [...initialTasks];
  mocked.listBoards.mockResolvedValue([makeBoard({ id: 1, name: 'Product' }), makeBoard({ id: 2, name: 'Ops' })]);
  mocked.listTasks.mockImplementation(async (_boardId, filter = {}) =>
    tasks.filter((task) => !filter.assignee || task.assignee === filter.assignee),
  );
  mocked.listAssignees.mockImplementation(async () =>
    [...new Set(tasks.map((task) => task.assignee).filter((a): a is string => Boolean(a)))].sort(),
  );
  mocked.createTask.mockImplementation(async (boardId, input) => {
    const task = makeTask({ ...input, boardId, position: tasks.length });
    tasks.push(task);
    return task;
  });
  mocked.updateTask.mockImplementation(async (id, input) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, ...input } : task));
    return tasks.find((task) => task.id === id)!;
  });
  mocked.moveTask.mockImplementation(async (id, status) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, status } : task));
    return tasks.find((task) => task.id === id)!;
  });
  mocked.deleteTask.mockImplementation(async (id) => {
    tasks = tasks.filter((task) => task.id !== id);
  });
}

const column = (status: string) => screen.getByTestId(`column-${status}`);

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three labelled columns with their tasks', async () => {
    useFakeBackend([
      makeTask({ id: 1, title: 'Plan', status: 'todo' }),
      makeTask({ id: 2, title: 'Build', status: 'in_progress' }),
      makeTask({ id: 3, title: 'Ship', status: 'done' }),
    ]);
    render(<App />);

    expect(await screen.findByRole('region', { name: 'To do' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In progress' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Done' })).toBeInTheDocument();
    expect(await within(column('todo')).findByText('Plan')).toBeInTheDocument();
    expect(within(column('in_progress')).getByText('Build')).toBeInTheDocument();
    expect(within(column('done')).getByText('Ship')).toBeInTheDocument();
    expect(window.location.search).toBe('?board=1');
  });

  it('selects the board from the URL', async () => {
    window.history.replaceState(null, '', '/?board=2');
    useFakeBackend([]);
    render(<App />);
    expect(await screen.findByTestId('board-name')).toHaveTextContent('Ops');
    expect(screen.getByLabelText('Board')).toHaveValue('2');
  });

  it('creates a task through the dialog', async () => {
    const user = userEvent.setup();
    useFakeBackend([]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    await user.type(within(dialog).getByLabelText('Title'), 'Write README');
    await user.type(within(dialog).getByLabelText('Assignee'), 'alice');
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocked.createTask).toHaveBeenCalledWith(1, {
      title: 'Write README',
      description: '',
      assignee: 'alice',
      status: 'todo',
    });
    expect(await within(column('todo')).findByText('Write README')).toBeInTheDocument();
  });

  it('edits a task', async () => {
    const user = userEvent.setup();
    useFakeBackend([makeTask({ id: 10, title: 'Old title' })]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Edit "Old title"' }));
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('New title')).toBeInTheDocument();
    expect(mocked.updateTask).toHaveBeenCalledWith(10, expect.objectContaining({ title: 'New title' }));
  });

  it('moves a task to the next column', async () => {
    const user = userEvent.setup();
    useFakeBackend([makeTask({ id: 20, title: 'Movable' })]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Move "Movable" to In progress' }));

    expect(await within(column('in_progress')).findByText('Movable')).toBeInTheDocument();
    expect(within(column('todo')).queryByText('Movable')).not.toBeInTheDocument();
    expect(mocked.moveTask).toHaveBeenCalledWith(20, 'in_progress');
  });

  it('deletes a task after confirmation', async () => {
    const user = userEvent.setup();
    useFakeBackend([makeTask({ id: 30, title: 'Remove me' })]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete "Remove me"' }));
    await user.click(screen.getByTestId('confirm-delete'));

    await waitFor(() => expect(screen.queryByText('Remove me')).not.toBeInTheDocument());
    expect(mocked.deleteTask).toHaveBeenCalledWith(30);
  });

  it('filters tasks by assignee', async () => {
    const user = userEvent.setup();
    useFakeBackend([
      makeTask({ id: 40, title: 'Alice task', assignee: 'alice' }),
      makeTask({ id: 41, title: 'Bob task', assignee: 'bob' }),
    ]);
    render(<App />);

    expect(await screen.findByText('Bob task')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Assignee'), 'alice');

    await waitFor(() => expect(screen.queryByText('Bob task')).not.toBeInTheDocument());
    expect(screen.getByText('Alice task')).toBeInTheDocument();
    expect(mocked.listTasks).toHaveBeenLastCalledWith(1, { assignee: 'alice' }, expect.any(AbortSignal));

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(await screen.findByText('Bob task')).toBeInTheDocument();
  });

  it('shows an error banner when an action fails', async () => {
    const user = userEvent.setup();
    useFakeBackend([makeTask({ id: 50, title: 'Fragile' })]);
    mocked.moveTask.mockRejectedValueOnce(new Error('Task 50 not found'));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Move "Fragile" to In progress' }));
    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Task 50 not found');
  });

  it('offers to create the first board when there are none', async () => {
    const user = userEvent.setup();
    mocked.listBoards.mockResolvedValue([]);
    mocked.createBoard.mockResolvedValue(makeBoard({ id: 7, name: 'First' }));
    mocked.listTasks.mockResolvedValue([]);
    mocked.listAssignees.mockResolvedValue([]);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Create your first board' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create board' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Board name is required');

    await user.type(screen.getByLabelText('Board name'), 'First');
    await user.click(screen.getByRole('button', { name: 'Create board' }));
    expect(await screen.findByTestId('board-name')).toHaveTextContent('First');
    expect(mocked.createBoard).toHaveBeenCalledWith('First');
  });
});
