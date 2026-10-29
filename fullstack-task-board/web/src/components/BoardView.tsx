import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { TASK_STATUSES, type Board, type Task, type TaskInput, type TaskStatus } from '../types';
import { Column } from './Column';
import { FilterBar } from './FilterBar';
import { TaskDialog } from './TaskDialog';

type DialogState = { mode: 'create' } | { mode: 'edit'; task: Task } | null;

interface BoardViewProps {
  board: Board;
}

const describeError = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong';

export function BoardView({ board }: BoardViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      api.listTasks(board.id, { assignee: assigneeFilter || undefined }, controller.signal),
      api.listAssignees(board.id, controller.signal),
    ])
      .then(([nextTasks, nextAssignees]) => {
        setTasks(nextTasks);
        setAssignees(nextAssignees);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(describeError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [board.id, assigneeFilter, reloadToken]);

  const columns = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const task of tasks) grouped[task.status].push(task);
    for (const status of TASK_STATUSES) grouped[status].sort((a, b) => a.position - b.position);
    return grouped;
  }, [tasks]);

  const runTaskAction = async (task: Task, action: () => Promise<unknown>) => {
    setBusyTaskId(task.id);
    try {
      await action();
      setActionError(null);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusyTaskId(null);
      reload();
    }
  };

  const handleMove = (task: Task, status: TaskStatus) => runTaskAction(task, () => api.moveTask(task.id, status));
  const handleDelete = (task: Task) => runTaskAction(task, () => api.deleteTask(task.id));

  const handleSubmit = async (input: TaskInput) => {
    if (dialog?.mode === 'edit') {
      await api.updateTask(dialog.task.id, input);
    } else {
      await api.createTask(board.id, input);
    }
    setDialog(null);
    reload();
  };

  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <main className="board" aria-labelledby="board-heading" data-testid="board" data-board-id={board.id}>
      <div className="board__toolbar">
        <h2 id="board-heading" className="board__name" data-testid="board-name">
          {board.name}
        </h2>
        <FilterBar assignees={assignees} value={assigneeFilter} onChange={setAssigneeFilter} />
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setDialog({ mode: 'create' })}
          data-testid="new-task-button"
        >
          New task
        </button>
      </div>

      {loadError && (
        <div className="banner banner--error" role="alert" data-testid="error-banner">
          <span>Could not load tasks: {loadError}</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {actionError && (
        <div className="banner banner--error" role="alert" data-testid="error-banner">
          <span>{actionError}</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="columns" aria-busy={loading} data-testid="columns" data-loading={loading}>
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            busyTaskId={busyTaskId}
            onEdit={(task) => setDialog({ mode: 'edit', task })}
            onMove={handleMove}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {dialog && (
        <TaskDialog
          key={dialog.mode === 'edit' ? dialog.task.id : 'create'}
          mode={dialog.mode}
          initial={dialog.mode === 'edit' ? dialog.task : undefined}
          onSubmit={handleSubmit}
          onClose={closeDialog}
        />
      )}
    </main>
  );
}
