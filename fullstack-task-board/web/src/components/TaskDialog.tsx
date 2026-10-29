import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { STATUS_LABELS, TASK_STATUSES, type TaskInput, type TaskStatus } from '../types';

type FieldErrors = Partial<Record<keyof TaskInput, string>>;

interface TaskDialogProps {
  mode: 'create' | 'edit';
  initial?: Partial<TaskInput>;
  onSubmit: (input: TaskInput) => Promise<void>;
  onClose: () => void;
}

export function validateTask(input: TaskInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.title.trim()) errors.title = 'Title is required';
  return errors;
}

export function TaskDialog({ mode, initial, onSubmit, onClose }: TaskDialogProps) {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<TaskInput>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    assignee: initial?.assignee ?? '',
    status: initial?.status ?? 'todo',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const errors = validateTask(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      titleRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title: values.title.trim(),
        description: values.description.trim(),
        assignee: values.assignee?.trim() ? values.assignee.trim() : null,
        status: values.status,
      });
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        const serverErrors: FieldErrors = {};
        for (const detail of error.details) {
          if (detail.path in values) serverErrors[detail.path as keyof TaskInput] ??= detail.message;
        }
        const unmapped = error.details.filter((detail) => !(detail.path in values));
        setFieldErrors(serverErrors);
        setFormError(
          unmapped.length > 0
            ? unmapped.map((detail) => detail.message).join('. ')
            : 'Please fix the highlighted fields.',
        );
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong');
      }
      setSubmitting(false);
    }
  }

  const heading = mode === 'create' ? 'New task' : 'Edit task';
  const fieldId = (name: string) => `${id}-${name}`;

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={fieldId('heading')}
        data-testid="task-dialog"
      >
        <h2 id={fieldId('heading')}>{heading}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="form-error" role="alert" data-testid="form-error">
              {formError}
            </div>
          )}

          <div className="field">
            <label htmlFor={fieldId('title')}>Title</label>
            <input
              ref={titleRef}
              id={fieldId('title')}
              name="title"
              value={values.title}
              onChange={(event) => set('title', event.target.value)}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? fieldId('title-error') : undefined}
              aria-required="true"
              autoComplete="off"
              data-testid="task-title-input"
            />
            {fieldErrors.title && (
              <p id={fieldId('title-error')} className="field__error" data-testid="title-error">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor={fieldId('description')}>Description</label>
            <textarea
              id={fieldId('description')}
              name="description"
              rows={3}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
              data-testid="task-description-input"
            />
            {fieldErrors.description && <p className="field__error">{fieldErrors.description}</p>}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={fieldId('assignee')}>Assignee</label>
              <input
                id={fieldId('assignee')}
                name="assignee"
                value={values.assignee ?? ''}
                onChange={(event) => set('assignee', event.target.value)}
                aria-invalid={Boolean(fieldErrors.assignee)}
                autoComplete="off"
                data-testid="task-assignee-input"
              />
              {fieldErrors.assignee && <p className="field__error">{fieldErrors.assignee}</p>}
            </div>

            <div className="field">
              <label htmlFor={fieldId('status')}>Status</label>
              <select
                id={fieldId('status')}
                name="status"
                value={values.status}
                onChange={(event) => set('status', event.target.value as TaskStatus)}
                data-testid="task-status-select"
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} data-testid="task-cancel">
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting} data-testid="task-submit">
              {submitting ? 'Saving…' : mode === 'create' ? 'Create task' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
