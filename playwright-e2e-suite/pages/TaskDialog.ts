import { expect, type Locator, type Page } from '@playwright/test';
import type { NewTask } from '../helpers/types';

/** The create / edit task modal. */
export class TaskDialog {
  readonly root: Locator;
  readonly heading: Locator;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly assigneeInput: Locator;
  readonly statusSelect: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly titleError: Locator;
  readonly formError: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog');
    this.heading = this.root.getByRole('heading');
    this.titleInput = this.root.getByLabel('Title');
    this.descriptionInput = this.root.getByLabel('Description');
    this.assigneeInput = this.root.getByLabel('Assignee');
    this.statusSelect = this.root.getByLabel('Status');
    this.submitButton = this.root.getByTestId('task-submit');
    this.cancelButton = this.root.getByTestId('task-cancel');
    this.titleError = this.root.getByTestId('title-error');
    this.formError = this.root.getByTestId('form-error');
  }

  async expectOpen(heading: 'New task' | 'Edit task'): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.heading).toHaveText(heading);
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toBeHidden();
  }

  /** Fills only the fields that are provided; `undefined` leaves a field untouched. */
  async fill(task: Partial<NewTask>): Promise<void> {
    if (task.title !== undefined) await this.titleInput.fill(task.title);
    if (task.description !== undefined) await this.descriptionInput.fill(task.description);
    if (task.assignee !== undefined) await this.assigneeInput.fill(task.assignee ?? '');
    if (task.status !== undefined) await this.statusSelect.selectOption(task.status);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async save(task: Partial<NewTask>): Promise<void> {
    await this.fill(task);
    await this.submit();
    await this.expectClosed();
  }
}
