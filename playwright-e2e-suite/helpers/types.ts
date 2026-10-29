export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export interface Board {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: number;
  boardId: number;
  title: string;
  description: string;
  assignee: string | null;
  status: TaskStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  description?: string;
  assignee?: string | null;
  status?: TaskStatus;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}
