import { STATUS_LABELS, type Task, type TaskStatus } from '../types';
import { TaskCard } from './TaskCard';

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  busyTaskId: number | null;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
}

export function Column({ status, tasks, busyTaskId, onEdit, onMove, onDelete }: ColumnProps) {
  const headingId = `column-${status}-heading`;
  return (
    <section className={`column column--${status}`} aria-labelledby={headingId} data-testid={`column-${status}`}>
      <header className="column__header">
        <h2 id={headingId}>{STATUS_LABELS[status]}</h2>
        <span className="column__count" data-testid="column-count" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
      </header>
      {tasks.length === 0 ? (
        <p className="column__empty">No tasks</p>
      ) : (
        <ul className="column__list" aria-label={`${STATUS_LABELS[status]} tasks`}>
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                busy={busyTaskId === task.id}
                onEdit={onEdit}
                onMove={onMove}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
