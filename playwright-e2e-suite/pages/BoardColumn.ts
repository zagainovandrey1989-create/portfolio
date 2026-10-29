import { expect, type Locator, type Page } from '@playwright/test';
import { STATUS_LABELS, type TaskStatus } from '../helpers/types';
import { TaskCard } from './TaskCard';

/** One of the three board columns (To do / In progress / Done). */
export class BoardColumn {
  readonly root: Locator;
  readonly heading: Locator;
  readonly count: Locator;
  readonly cards: Locator;
  readonly cardTitles: Locator;

  constructor(
    private readonly page: Page,
    readonly status: TaskStatus,
  ) {
    this.root = page.getByRole('region', { name: STATUS_LABELS[status], exact: true });
    this.heading = this.root.getByRole('heading', { level: 2 });
    this.count = this.root.getByTestId('column-count');
    this.cards = this.root.getByTestId('task-card');
    this.cardTitles = this.cards.getByTestId('task-title');
  }

  card(title: string): TaskCard {
    return new TaskCard(this.page, this.root.getByRole('article', { name: title, exact: true }));
  }

  /** Asserts the exact, ordered list of task titles in this column. */
  async expectTitles(titles: string[]): Promise<void> {
    await expect(this.cardTitles).toHaveText(titles);
    await expect(this.count).toHaveText(String(titles.length));
  }
}
