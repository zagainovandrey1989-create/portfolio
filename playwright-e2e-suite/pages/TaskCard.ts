import { expect, type Locator, type Page } from '@playwright/test';
import type { TaskStatus } from '../helpers/types';
import { TaskDialog } from './TaskDialog';

/** A single task card on the board. */
export class TaskCard {
  readonly title: Locator;
  readonly description: Locator;
  readonly assignee: Locator;
  readonly moveLeftButton: Locator;
  readonly moveRightButton: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  constructor(
    private readonly page: Page,
    readonly root: Locator,
  ) {
    this.title = root.getByTestId('task-title');
    this.description = root.getByTestId('task-description');
    this.assignee = root.getByTestId('task-assignee');
    this.moveLeftButton = root.getByTestId('move-left');
    this.moveRightButton = root.getByTestId('move-right');
    this.editButton = root.getByTestId('edit-task');
    this.deleteButton = root.getByTestId('delete-task');
    this.confirmDeleteButton = root.getByTestId('confirm-delete');
    this.cancelDeleteButton = root.getByTestId('cancel-delete');
  }

  async expectStatus(status: TaskStatus): Promise<void> {
    await expect(this.root).toHaveAttribute('data-status', status);
  }

  async moveRight(): Promise<void> {
    await this.moveRightButton.click();
  }

  async moveLeft(): Promise<void> {
    await this.moveLeftButton.click();
  }

  async edit(): Promise<TaskDialog> {
    await this.editButton.click();
    const dialog = new TaskDialog(this.page);
    await dialog.expectOpen('Edit task');
    return dialog;
  }

  async delete(): Promise<void> {
    await this.deleteButton.click();
    await this.confirmDeleteButton.click();
  }
}
