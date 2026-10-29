import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskCard } from '../components/TaskCard';
import { makeTask } from './fixtures';

function renderCard(task = makeTask({ title: 'Write tests', assignee: 'alice', description: 'Cover edge cases' })) {
  const handlers = { onEdit: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() };
  render(<TaskCard task={task} {...handlers} />);
  return { task, ...handlers };
}

describe('TaskCard', () => {
  it('renders title, description and assignee', () => {
    renderCard();
    expect(screen.getByRole('article', { name: 'Write tests' })).toBeInTheDocument();
    expect(screen.getByText('Cover edge cases')).toBeInTheDocument();
    expect(screen.getByTestId('task-assignee')).toHaveTextContent('alice');
  });

  it('shows "Unassigned" when there is no assignee', () => {
    renderCard(makeTask({ assignee: null }));
    expect(screen.getByTestId('task-assignee')).toHaveTextContent('Unassigned');
  });

  it('only offers moving right from the first column', () => {
    renderCard(makeTask({ title: 'T', status: 'todo' }));
    expect(screen.queryByRole('button', { name: /to To do/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move "T" to In progress' })).toBeEnabled();
  });

  it('only offers moving left from the last column', () => {
    renderCard(makeTask({ title: 'T', status: 'done' }));
    expect(screen.getByRole('button', { name: 'Move "T" to In progress' })).toBeEnabled();
    expect(screen.queryByTestId('move-right')).not.toBeVisible();
  });

  it('calls onMove with the next status', async () => {
    const user = userEvent.setup();
    const { onMove, task } = renderCard(makeTask({ title: 'T', status: 'in_progress' }));
    await user.click(screen.getByRole('button', { name: 'Move "T" to Done' }));
    expect(onMove).toHaveBeenCalledWith(task, 'done');
    await user.click(screen.getByRole('button', { name: 'Move "T" to To do' }));
    expect(onMove).toHaveBeenLastCalledWith(task, 'todo');
  });

  it('calls onEdit', async () => {
    const user = userEvent.setup();
    const { onEdit, task } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Edit "Write tests"' }));
    expect(onEdit).toHaveBeenCalledWith(task);
  });

  it('asks for confirmation before deleting', async () => {
    const user = userEvent.setup();
    const { onDelete, task } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Delete "Write tests"' }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByTestId('confirm-delete')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete "Write tests"' }));
    await user.click(screen.getByTestId('confirm-delete'));
    expect(onDelete).toHaveBeenCalledWith(task);
  });
});
