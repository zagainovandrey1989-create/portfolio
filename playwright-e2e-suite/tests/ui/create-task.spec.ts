import { expect, test } from '../../fixtures/test';

test.describe('Create task', () => {
  test('creates a task in the To do column with all details', async ({ boardPage, board, api }) => {
    await boardPage.open();
    await boardPage.column('todo').expectTitles([]);

    await boardPage.createTask({
      title: 'Prepare release notes',
      description: 'Summarise the changes since v1.2',
      assignee: 'alice',
    });

    const todo = boardPage.column('todo');
    await todo.expectTitles(['Prepare release notes']);
    const card = todo.card('Prepare release notes');
    await expect(card.description).toHaveText('Summarise the changes since v1.2');
    await expect(card.assignee).toHaveText('alice');

    // Persisted on the server, not only rendered.
    const [saved] = await api.listTasks(board.id);
    expect(saved).toMatchObject({
      title: 'Prepare release notes',
      description: 'Summarise the changes since v1.2',
      assignee: 'alice',
      status: 'todo',
    });
  });

  test('creates a task directly in another column and keeps it after reload', async ({ boardPage, page }) => {
    await boardPage.open();

    await boardPage.createTask({ title: 'Already started', status: 'in_progress' });

    await boardPage.column('in_progress').expectTitles(['Already started']);
    await expect(boardPage.card('Already started').assignee).toHaveText('Unassigned');

    await page.reload();
    await boardPage.waitForIdle();
    await boardPage.column('in_progress').expectTitles(['Already started']);
  });

  test('appends new tasks to the end of the column', async ({ boardPage, board, api }) => {
    await api.createTask(board.id, { title: 'First' });
    await boardPage.open();

    await boardPage.createTask({ title: 'Second' });

    await boardPage.column('todo').expectTitles(['First', 'Second']);
  });

  test('cancelling the dialog does not create a task', async ({ boardPage, board, api }) => {
    await boardPage.open();
    const dialog = await boardPage.openNewTaskDialog();
    await dialog.fill({ title: 'Never saved' });
    await dialog.cancelButton.click();

    await dialog.expectClosed();
    await expect(boardPage.allCards).toHaveCount(0);
    expect(await api.listTasks(board.id)).toEqual([]);
  });
});
