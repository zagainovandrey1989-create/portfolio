import { expect, test } from '../../fixtures/test';

test.describe('Validation errors', () => {
  test('shows an error for an empty title and sends no request', async ({ boardPage, board, api, page }) => {
    await boardPage.open();
    const createRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/tasks')) createRequests.push(request.url());
    });

    const dialog = await boardPage.openNewTaskDialog();
    await dialog.submit();

    await expect(dialog.titleError).toHaveText('Title is required');
    await expect(dialog.titleInput).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.titleInput).toBeFocused();
    await expect(dialog.root).toBeVisible();
    expect(createRequests).toEqual([]);
    expect(await api.listTasks(board.id)).toEqual([]);
  });

  test('treats a whitespace-only title as empty', async ({ boardPage }) => {
    await boardPage.open();
    const dialog = await boardPage.openNewTaskDialog();
    await dialog.fill({ title: '    ' });
    await dialog.submit();
    await expect(dialog.titleError).toHaveText('Title is required');
  });

  test('shows the server-side error for a title that is too long', async ({ boardPage, board, api }) => {
    await boardPage.open();
    const dialog = await boardPage.openNewTaskDialog();
    await dialog.fill({ title: 'x'.repeat(201) });
    await dialog.submit();

    await expect(dialog.titleError).toHaveText('Title must be at most 200 characters');
    await expect(dialog.formError).toHaveText('Please fix the highlighted fields.');
    expect(await api.listTasks(board.id)).toEqual([]);
  });

  test('clears the error once the title is fixed and saves', async ({ boardPage }) => {
    await boardPage.open();
    const dialog = await boardPage.openNewTaskDialog();
    await dialog.submit();
    await expect(dialog.titleError).toBeVisible();

    await dialog.fill({ title: 'Fixed title' });
    await expect(dialog.titleError).toBeHidden();
    await dialog.submit();

    await dialog.expectClosed();
    await boardPage.column('todo').expectTitles(['Fixed title']);
  });

  test('validates the title when editing too', async ({ boardPage, board, api }) => {
    await api.createTask(board.id, { title: 'Valid title' });
    await boardPage.open();

    const dialog = await boardPage.card('Valid title').edit();
    await dialog.fill({ title: '' });
    await dialog.submit();

    await expect(dialog.titleError).toHaveText('Title is required');
  });
});
