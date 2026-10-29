import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { Board, NewTask, Task, TaskStatus } from './types';

/**
 * Thin typed wrapper over the Task Board REST API.
 * Used to seed and inspect data so UI tests start from a known state
 * without clicking through set-up steps.
 */
export class TaskBoardApi {
  constructor(private readonly request: APIRequestContext) {}

  async createBoard(name: string): Promise<Board> {
    return this.data<Board>(await this.request.post('/api/boards', { data: { name } }), 201);
  }

  async deleteBoard(id: number): Promise<void> {
    const response = await this.request.delete(`/api/boards/${id}`);
    expect([204, 404], `DELETE /api/boards/${id}`).toContain(response.status());
  }

  async createTask(boardId: number, task: NewTask): Promise<Task> {
    return this.data<Task>(await this.request.post(`/api/boards/${boardId}/tasks`, { data: task }), 201);
  }

  async createTasks(boardId: number, tasks: NewTask[]): Promise<Task[]> {
    const created: Task[] = [];
    // Sequential on purpose: keeps positions deterministic.
    for (const task of tasks) created.push(await this.createTask(boardId, task));
    return created;
  }

  async listTasks(boardId: number, filter: { assignee?: string; status?: TaskStatus } = {}): Promise<Task[]> {
    const params: Record<string, string> = {};
    if (filter.assignee) params.assignee = filter.assignee;
    if (filter.status) params.status = filter.status;
    return this.data<Task[]>(await this.request.get(`/api/boards/${boardId}/tasks`, { params }));
  }

  async getTask(id: number): Promise<Task> {
    return this.data<Task>(await this.request.get(`/api/tasks/${id}`));
  }

  async moveTask(id: number, status: TaskStatus, position?: number): Promise<Task> {
    const data = position === undefined ? { status } : { status, position };
    return this.data<Task>(await this.request.post(`/api/tasks/${id}/move`, { data }));
  }

  private async data<T>(response: APIResponse, expectedStatus = 200): Promise<T> {
    const body = await response.text();
    expect(response.status(), `${response.url()} -> ${body}`).toBe(expectedStatus);
    return (JSON.parse(body) as { data: T }).data;
  }
}
