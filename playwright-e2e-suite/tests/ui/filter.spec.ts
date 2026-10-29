import { expect, test } from '../../fixtures/test';

test.describe('Filter by assignee', () => {
  test.beforeEach(async ({ api, board }) => {
    await api.createTasks(board.id, [
      { title: 'Alice: design', assignee: 'alice' },
      { title: 'Bob: backend', assignee: 'bob', status: 'in_progress' },
      { title: 'Alice: review', assignee: 'alice', status: 'done' },
      { title: 'Nobody yet' },
    ]);
  });

  test('lists every assignee on the board as a filter option', async ({ boardPage }) => {
    await boardPage.open();
    await expect(boardPage.assigneeFilter.locator('option')).toHaveText(['All assignees', 'alice', 'bob']);
  });

  test('shows only the selected assignee’s tasks across all columns', async ({ boardPage }) => {
    await boardPage.open();
    await expect(boardPage.allCards).toHaveCount(4);

    await boardPage.filterByAssignee('alice');

    await boardPage.column('todo').expectTitles(['Alice: design']);
    await boardPage.column('in_progress').expectTitles([]);
    await boardPage.column('done').expectTitles(['Alice: review']);
    await expect(boardPage.allCards.getByTestId('task-assignee')).toHaveText(['alice', 'alice']);
  });

  test('switching and clearing the filter restores the full board', async ({ boardPage }) => {
    await boardPage.open();

    await boardPage.filterByAssignee('bob');
    await boardPage.column('in_progress').expectTitles(['Bob: backend']);
    await expect(boardPage.allCards).toHaveCount(1);

    await boardPage.clearFilter();
    await expect(boardPage.assigneeFilter).toHaveValue('');
    await expect(boardPage.allCards).toHaveCount(4);
  });

  test('a task created for another assignee is hidden while filtering', async ({ boardPage }) => {
    await boardPage.open();
    await boardPage.filterByAssignee('alice');

    await boardPage.createTask({ title: 'Bob: deploy', assignee: 'bob' });

    await expect(boardPage.card('Bob: deploy').root).toHaveCount(0);
    await expect(boardPage.assigneeFilter).toHaveValue('alice');

    await boardPage.clearFilter();
    await expect(boardPage.card('Bob: deploy').root).toBeVisible();
  });
});
