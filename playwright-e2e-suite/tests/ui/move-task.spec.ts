import { expect, test } from '../../fixtures/test';

test.describe('Move task across columns', () => {
  test('moves a task forward through every column and back', async ({ boardPage, board, api }) => {
    const [task] = await api.createTasks(board.id, [{ title: 'Implement login' }, { title: 'Write tests' }]);
    await boardPage.open();

    const card = boardPage.card('Implement login');

    await card.moveRight();
    await card.expectStatus('in_progress');
    await boardPage.column('todo').expectTitles(['Write tests']);
    await boardPage.column('in_progress').expectTitles(['Implement login']);

    await card.moveRight();
    await card.expectStatus('done');
    await boardPage.column('in_progress').expectTitles([]);
    await boardPage.column('done').expectTitles(['Implement login']);
    // Last column: no further "move right".
    await expect(card.moveRightButton).toBeHidden();

    await card.moveLeft();
    await card.expectStatus('in_progress');
    await boardPage.column('in_progress').expectTitles(['Implement login']);

    expect((await api.getTask(task!.id)).status).toBe('in_progress');
  });

  test('a moved task is appended to the end of the target column', async ({ boardPage, board, api }) => {
    await api.createTasks(board.id, [
      { title: 'Review PR', status: 'in_progress' },
      { title: 'Fix bug', status: 'in_progress' },
      { title: 'Update docs' },
    ]);
    await boardPage.open();

    await boardPage.card('Update docs').moveRight();

    await boardPage.column('in_progress').expectTitles(['Review PR', 'Fix bug', 'Update docs']);
  });

  test('the first column does not offer moving left', async ({ boardPage, board, api }) => {
    await api.createTask(board.id, { title: 'Fresh task' });
    await boardPage.open();
    await expect(boardPage.card('Fresh task').moveLeftButton).toBeHidden();
    await expect(boardPage.card('Fresh task').moveRightButton).toBeVisible();
  });

  test('reflects moves made through the API after a reload', async ({ boardPage, board, api, page }) => {
    const task = await api.createTask(board.id, { title: 'Moved elsewhere' });
    await boardPage.open();
    await boardPage.column('todo').expectTitles(['Moved elsewhere']);

    await api.moveTask(task.id, 'done');
    await page.reload();
    await boardPage.waitForIdle();

    await boardPage.column('todo').expectTitles([]);
    await boardPage.column('done').expectTitles(['Moved elsewhere']);
  });
});
