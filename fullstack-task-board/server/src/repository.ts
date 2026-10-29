import type { DB } from './db.js';
import type { CreateTaskInput, TaskFilter, TaskStatus, UpdateTaskInput } from './schemas.js';

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

interface BoardRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: number;
  board_id: number;
  title: string;
  description: string;
  assignee: string | null;
  status: TaskStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

const toBoard = (row: BoardRow): Board => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  boardId: row.board_id,
  title: row.title,
  description: row.description,
  assignee: row.assignee,
  status: row.status,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const now = () => new Date().toISOString();

/**
 * Data access for boards and tasks.
 *
 * Tasks keep a dense, zero-based `position` per (board, status) column.
 * Every mutation that changes column membership runs in a transaction and
 * closes / opens gaps so ordering is always consistent.
 */
export class TaskBoardRepository {
  constructor(private readonly db: DB) {}

  // ---------- boards ----------

  listBoards(): Board[] {
    const rows = this.db.prepare('SELECT * FROM boards ORDER BY id').all() as BoardRow[];
    return rows.map(toBoard);
  }

  getBoard(id: number): Board | undefined {
    const row = this.db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as BoardRow | undefined;
    return row ? toBoard(row) : undefined;
  }

  createBoard(name: string): Board {
    const ts = now();
    const result = this.db
      .prepare('INSERT INTO boards (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(name, ts, ts);
    return this.getBoard(Number(result.lastInsertRowid))!;
  }

  updateBoard(id: number, name: string): Board | undefined {
    const result = this.db
      .prepare('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, now(), id);
    return result.changes ? this.getBoard(id) : undefined;
  }

  deleteBoard(id: number): boolean {
    return this.db.prepare('DELETE FROM boards WHERE id = ?').run(id).changes > 0;
  }

  // ---------- tasks ----------

  listTasks(boardId: number, filter: TaskFilter = {}): Task[] {
    const clauses = ['board_id = @boardId'];
    const params: Record<string, string | number> = { boardId };
    if (filter.status) {
      clauses.push('status = @status');
      params.status = filter.status;
    }
    if (filter.assignee) {
      clauses.push('assignee = @assignee COLLATE NOCASE');
      params.assignee = filter.assignee;
    }
    const sql = `SELECT * FROM tasks WHERE ${clauses.join(' AND ')}
      ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, position`;
    const rows = this.db.prepare(sql).all(params) as TaskRow[];
    return rows.map(toTask);
  }

  listAssignees(boardId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT assignee FROM tasks
         WHERE board_id = ? AND assignee IS NOT NULL
         ORDER BY assignee COLLATE NOCASE`,
      )
      .all(boardId) as { assignee: string }[];
    return rows.map((row) => row.assignee);
  }

  getTask(id: number): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? toTask(row) : undefined;
  }

  createTask(boardId: number, input: CreateTaskInput): Task {
    const ts = now();
    const insert = this.db.transaction(() => {
      const position = this.columnSize(boardId, input.status);
      const result = this.db
        .prepare(
          `INSERT INTO tasks (board_id, title, description, assignee, status, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(boardId, input.title, input.description, input.assignee, input.status, position, ts, ts);
      return Number(result.lastInsertRowid);
    });
    return this.getTask(insert())!;
  }

  updateTask(id: number, input: UpdateTaskInput): Task | undefined {
    const update = this.db.transaction(() => {
      const existing = this.getTask(id);
      if (!existing) return undefined;

      if (input.status && input.status !== existing.status) {
        this.moveWithinTransaction(existing, input.status, undefined);
      }

      const next = {
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        assignee: input.assignee === undefined ? existing.assignee : input.assignee,
      };
      this.db
        .prepare('UPDATE tasks SET title = ?, description = ?, assignee = ?, updated_at = ? WHERE id = ?')
        .run(next.title, next.description, next.assignee, now(), id);
      return this.getTask(id);
    });
    return update();
  }

  /**
   * Moves a task to `status` at `position` (clamped; defaults to the end of the column).
   * Works for both cross-column moves and reordering within a column.
   */
  moveTask(id: number, status: TaskStatus, position?: number): Task | undefined {
    const move = this.db.transaction(() => {
      const existing = this.getTask(id);
      if (!existing) return undefined;
      this.moveWithinTransaction(existing, status, position);
      return this.getTask(id);
    });
    return move();
  }

  deleteTask(id: number): boolean {
    const remove = this.db.transaction(() => {
      const existing = this.getTask(id);
      if (!existing) return false;
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      this.closeGap(existing.boardId, existing.status, existing.position);
      return true;
    });
    return remove();
  }

  // ---------- helpers (must be called inside a transaction) ----------

  private moveWithinTransaction(task: Task, status: TaskStatus, position: number | undefined): void {
    // Take the task out of its current column.
    this.db.prepare('UPDATE tasks SET position = -1 WHERE id = ?').run(task.id);
    this.closeGap(task.boardId, task.status, task.position);

    // Insert it into the target column.
    const size = this.columnSize(task.boardId, status, task.id);
    const target = Math.min(position ?? size, size);
    this.db
      .prepare(
        `UPDATE tasks SET position = position + 1
         WHERE board_id = ? AND status = ? AND position >= ? AND id != ?`,
      )
      .run(task.boardId, status, target, task.id);
    this.db
      .prepare('UPDATE tasks SET status = ?, position = ?, updated_at = ? WHERE id = ?')
      .run(status, target, now(), task.id);
  }

  private closeGap(boardId: number, status: TaskStatus, position: number): void {
    this.db
      .prepare('UPDATE tasks SET position = position - 1 WHERE board_id = ? AND status = ? AND position > ?')
      .run(boardId, status, position);
  }

  private columnSize(boardId: number, status: TaskStatus, excludeId = -1): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM tasks WHERE board_id = ? AND status = ? AND id != ?')
      .get(boardId, status, excludeId) as { count: number };
    return row.count;
  }
}
