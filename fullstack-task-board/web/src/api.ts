import type { Board, ErrorDetail, Task, TaskInput, TaskStatus } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { method = 'GET', body, signal } = init;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string; details?: ErrorDetail[] } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      payload?.error?.details ?? [],
    );
  }
  return payload?.data as T;
}

export interface TaskFilter {
  assignee?: string;
  status?: TaskStatus;
}

export const api = {
  listBoards: (signal?: AbortSignal) => request<Board[]>('/boards', { signal }),
  createBoard: (name: string) => request<Board>('/boards', { method: 'POST', body: { name } }),

  listTasks: (boardId: number, filter: TaskFilter = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (filter.assignee) params.set('assignee', filter.assignee);
    if (filter.status) params.set('status', filter.status);
    const query = params.size ? `?${params.toString()}` : '';
    return request<Task[]>(`/boards/${boardId}/tasks${query}`, { signal });
  },
  listAssignees: (boardId: number, signal?: AbortSignal) => request<string[]>(`/boards/${boardId}/assignees`, { signal }),

  createTask: (boardId: number, input: TaskInput) =>
    request<Task>(`/boards/${boardId}/tasks`, { method: 'POST', body: input }),
  updateTask: (taskId: number, input: Partial<TaskInput>) =>
    request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: input }),
  moveTask: (taskId: number, status: TaskStatus, position?: number) =>
    request<Task>(`/tasks/${taskId}/move`, { method: 'POST', body: position === undefined ? { status } : { status, position } }),
  deleteTask: (taskId: number) => request<void>(`/tasks/${taskId}`, { method: 'DELETE' }),
};

export type Api = typeof api;
