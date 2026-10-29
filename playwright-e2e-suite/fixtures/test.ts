import { test as base, expect } from '@playwright/test';
import { TaskBoardApi } from '../helpers/api-client';
import { uniqueName } from '../helpers/data';
import type { Board } from '../helpers/types';
import { BoardPage } from '../pages/BoardPage';

interface Fixtures {
  /** Typed REST client bound to the test's baseURL. */
  api: TaskBoardApi;
  /** A fresh, empty board created through the API and removed after the test. */
  board: Board;
  /** Board page object (not navigated yet: seed data first, then call `open()`). */
  boardPage: BoardPage;
}

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new TaskBoardApi(request));
  },

  board: async ({ api }, use, testInfo) => {
    const board = await api.createBoard(uniqueName('E2E', testInfo));
    await use(board);
    await api.deleteBoard(board.id);
  },

  boardPage: async ({ page, board }, use) => {
    await use(new BoardPage(page, board));
  },
});

export { expect };
