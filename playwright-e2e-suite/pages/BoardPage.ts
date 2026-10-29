import { expect, type Locator, type Page } from '@playwright/test';
import type { Board, NewTask, TaskStatus } from '../helpers/types';
import { BoardColumn } from './BoardColumn';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

/** The main board screen: toolbar, filter, three columns and the task dialog. */
export class BoardPage {
  readonly boardName: Locator;
  readonly boardSelect: Locator;
  readonly newTaskButton: Locator;
  readonly assigneeFilter: Locator;
  readonly clearFilterButton: Locator;
  readonly columnsContainer: Locator;
  readonly errorBanner: Locator;
  readonly allCards: Locator;
  readonly dialog: TaskDialog;

  constructor(
    readonly page: Page,
    private readonly board?: Board,
  ) {
    this.boardName = page.getByTestId('board-name');
    this.boardSelect = page.getByLabel('Board', { exact: true });
    this.newTaskButton = page.getByRole('button', { name: 'New task' });
    this.assigneeFilter = page.getByRole('search').getByLabel('Assignee');
    this.clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    this.columnsContainer = page.getByTestId('columns');
    this.errorBanner = page.getByTestId('error-banner');
    this.allCards = page.getByTestId('task-card');
    this.dialog = new TaskDialog(page);
  }

  /** Opens the board this page object was created for. */
  async open(): Promise<void> {
    if (!this.board) throw new Error('BoardPage was created without a board; use goto(id) instead');
    await this.goto(this.board.id, this.board.name);
  }

  async goto(boardId: number, expectedName?: string): Promise<void> {
    await this.page.goto(`/?board=${boardId}`);
    if (expectedName) await expect(this.boardName).toHaveText(expectedName);
    else await expect(this.boardName).toBeVisible();
    await this.waitForIdle();
  }

  /** Waits until the board has finished (re)loading its tasks. */
  async waitForIdle(): Promise<void> {
    await expect(this.columnsContainer).toHaveAttribute('data-loading', 'false');
  }

  column(status: TaskStatus): BoardColumn {
    return new BoardColumn(this.page, status);
  }

  /** A task card anywhere on the board, located by its accessible name (the title). */
  card(title: string): TaskCard {
    return new TaskCard(this.page, this.page.getByRole('article', { name: title, exact: true }));
  }

  async openNewTaskDialog(): Promise<TaskDialog> {
    await this.newTaskButton.click();
    await this.dialog.expectOpen('New task');
    return this.dialog;
  }

  async createTask(task: NewTask): Promise<void> {
    const dialog = await this.openNewTaskDialog();
    await dialog.save(task);
    await this.waitForIdle();
  }

  async filterByAssignee(assignee: string): Promise<void> {
    await this.assigneeFilter.selectOption(assignee);
    await this.waitForIdle();
  }

  async clearFilter(): Promise<void> {
    await this.clearFilterButton.click();
    await this.waitForIdle();
  }
}
