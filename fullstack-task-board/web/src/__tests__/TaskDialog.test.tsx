import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { TaskDialog, validateTask } from '../components/TaskDialog';

describe('validateTask', () => {
  it('requires a non-blank title', () => {
    expect(validateTask({ title: '  ', description: '', assignee: null, status: 'todo' })).toEqual({
      title: 'Title is required',
    });
    expect(validateTask({ title: 'ok', description: '', assignee: null, status: 'todo' })).toEqual({});
  });
});

describe('TaskDialog', () => {
  it('is an accessible modal dialog that focuses the title', () => {
    render(<TaskDialog mode="create" onSubmit={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Title')).toHaveFocus();
  });

  it('shows a validation error and does not submit an empty title', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TaskDialog mode="create" onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('title-error')).toHaveTextContent('Title is required');
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Title is required');
  });

  it('submits trimmed values and maps a blank assignee to null', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TaskDialog mode="create" onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Title'), '  Ship it  ');
    await user.type(screen.getByLabelText('Description'), 'Release notes');
    await user.type(screen.getByLabelText('Assignee'), '   ');
    await user.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Ship it',
      description: 'Release notes',
      assignee: null,
      status: 'in_progress',
    });
  });

  it('prefills values in edit mode', () => {
    render(
      <TaskDialog
        mode="edit"
        initial={{ title: 'Old', description: 'Desc', assignee: 'bob', status: 'done' }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Old');
    expect(screen.getByLabelText('Assignee')).toHaveValue('bob');
    expect(screen.getByLabelText('Status')).toHaveValue('done');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('shows server-side validation errors next to the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', [
          { path: 'title', message: 'Title must be at most 200 characters' },
        ]),
      );
    render(<TaskDialog mode="create" onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Title'), 'x');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByTestId('title-error')).toHaveTextContent('Title must be at most 200 characters');
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled();
  });

  it('closes on Escape and on Cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TaskDialog mode="create" onSubmit={vi.fn()} onClose={onClose} />);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
