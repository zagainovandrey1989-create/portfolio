import { expect, test } from '../../fixtures/test';

test.describe('Edit task', () => {
  test('updates title, description and assignee', async ({ boardPage, board, api }) => {
    const task = await api.createTask(board.id, { title: 'Draft spec', assignee: 'bob' });
    await boardPage.open();

    const dialog = await boardPage.card('Draft spec').edit();
    await expect(dialog.titleInput).toHaveValue('Draft spec');
    await expect(dialog.assigneeInput).toHaveValue('bob');

    await dialog.save({ title: 'Final spec', description: 'Approved by the team', assignee: 'carol' });

    const card = boardPage.card('Final spec');
    await expect(card.root).toBeVisible();
    await expect(card.description).toHaveText('Approved by the team');
    await expect(card.assignee).toHaveText('carol');
    await expect(boardPage.card('Draft spec').root).toHaveCount(0);

    expect(await api.getTask(task.id)).toMatchObject({
      title: 'Final spec',
      description: 'Approved by the team',
      assignee: 'carol',
    });
  });

  test('clearing the assignee makes the task unassigned', async ({ boardPage, board, api }) => {
    const task = await api.createTask(board.id, { title: 'Hand over', assignee: 'dave' });
    await boardPage.open();

    const dialog = await boardPage.card('Hand over').edit();
    await dialog.save({ assignee: '' });

    await expect(boardPage.card('Hand over').assignee).toHaveText('Unassigned');
    expect((await api.getTask(task.id)).assignee).toBeNull();
  });

  test('changing the status in the dialog moves the card', async ({ boardPage, board, api }) => {
    await api.createTask(board.id, { title: 'Status via form' });
    await boardPage.open();

    const dialog = await boardPage.card('Status via form').edit();
    await dialog.save({ status: 'done' });

    await boardPage.column('todo').expectTitles([]);
    await boardPage.column('done').expectTitles(['Status via form']);
  });

  test('Escape closes the dialog without saving', async ({ boardPage, board, api, page }) => {
    const task = await api.createTask(board.id, { title: 'Unchanged' });
    await boardPage.open();

    const dialog = await boardPage.card('Unchanged').edit();
    await dialog.fill({ title: 'Changed?' });
    await page.keyboard.press('Escape');

    await dialog.expectClosed();
    await expect(boardPage.card('Unchanged').root).toBeVisible();
    expect((await api.getTask(task.id)).title).toBe('Unchanged');
  });
});
