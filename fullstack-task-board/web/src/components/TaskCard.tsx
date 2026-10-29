import { useState } from 'react';
import { STATUS_LABELS, TASK_STATUSES, type Task, type TaskStatus } from '../types';

interface TaskCardProps {
  task: Task;
  busy?: boolean;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, busy = false, onEdit, onMove, onDelete }: TaskCardProps) {
  const [confirming, setConfirming] = useState(false);
  const index = TASK_STATUSES.indexOf(task.status);
  const previous = index > 0 ? TASK_STATUSES[index - 1] : undefined;
  const next = index < TASK_STATUSES.length - 1 ? TASK_STATUSES[index + 1] : undefined;
  const titleId = `task-${task.id}-title`;

  return (
    <article
      className="task-card"
      aria-labelledby={titleId}
      aria-busy={busy}
      data-testid="task-card"
      data-task-id={task.id}
      data-status={task.status}
    >
      <h3 id={titleId} className="task-card__title" data-testid="task-title">
        {task.title}
      </h3>
      {task.description && (
        <p className="task-card__description" data-testid="task-description">
          {task.description}
        </p>
      )}
      <p className="task-card__meta">
        <span className={task.assignee ? 'chip' : 'chip chip--muted'} data-testid="task-assignee">
          {task.assignee ?? 'Unassigned'}
        </span>
      </p>

      {confirming ? (
        <div className="task-card__confirm" role="group" aria-label={`Confirm deleting ${task.title}`}>
          <span>Delete this task?</span>
          <button
            type="button"
            className="btn btn--danger btn--small"
            data-testid="confirm-delete"
            disabled={busy}
            onClick={() => onDelete(task)}
          >
            Delete
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            data-testid="cancel-delete"
            onClick={() => setConfirming(false)}
          >
            Keep
          </button>
        </div>
      ) : (
        <div className="task-card__actions">
          <button
            type="button"
            className="btn btn--icon"
            aria-label={previous ? `Move "${task.title}" to ${STATUS_LABELS[previous]}` : undefined}
            title={previous ? `Move to ${STATUS_LABELS[previous]}` : undefined}
            data-testid="move-left"
            disabled={!previous || busy}
            hidden={!previous}
            onClick={() => previous && onMove(task, previous)}
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <button
            type="button"
            className="btn btn--icon"
            aria-label={next ? `Move "${task.title}" to ${STATUS_LABELS[next]}` : undefined}
            title={next ? `Move to ${STATUS_LABELS[next]}` : undefined}
            data-testid="move-right"
            disabled={!next || busy}
            hidden={!next}
            onClick={() => next && onMove(task, next)}
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-label={`Edit "${task.title}"`}
            data-testid="edit-task"
            disabled={busy}
            onClick={() => onEdit(task)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small btn--danger-text"
            aria-label={`Delete "${task.title}"`}
            data-testid="delete-task"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
