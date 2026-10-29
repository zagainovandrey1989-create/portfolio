import { expect, test } from '../../fixtures/test';

test.describe('Delete task', () => {
  test('deletes a task after confirmation', async ({ boardPage, board, api }) => {
    const [, toDelete] = await api.createTasks(board.id, [{ title: 'Keep me' }, { title: 'Delete me' }]);
    await boardPage.open();

    await boardPage.card('Delete me').delete();

    await boardPage.column('todo').expectTitles(['Keep me']);
    const remaining = await api.listTasks(board.id);
    expect(remaining.map((task) => task.id)).not.toContain(toDelete!.id);
    expect(remaining).toHaveLength(1);
  });

  test('cancelling the confirmation keeps the task', async ({ boardPage, board, api }) => {
    await api.createTask(board.id, { title: 'Second thoughts' });
    await boardPage.open();

    const card = boardPage.card('Second thoughts');
    await card.deleteButton.click();
    await expect(card.confirmDeleteButton).toBeVisible();
    await card.cancelDeleteButton.click();

    await expect(card.confirmDeleteButton).toBeHidden();
    await boardPage.column('todo').expectTitles(['Second thoughts']);
    expect(await api.listTasks(board.id)).toHaveLength(1);
  });

  test('deleting the last task shows the empty column state', async ({ boardPage, board, api }) => {
    await api.createTask(board.id, { title: 'Only task', status: 'done' });
    await boardPage.open();

    await boardPage.card('Only task').delete();

    await boardPage.column('done').expectTitles([]);
    await expect(boardPage.column('done').root.getByText('No tasks')).toBeVisible();
  });
});
