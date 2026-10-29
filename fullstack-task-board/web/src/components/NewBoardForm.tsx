import { useState, type FormEvent } from 'react';

interface NewBoardFormProps {
  onCreate: (name: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function NewBoardForm({ onCreate, onCancel, autoFocus = false }: NewBoardFormProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Board name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create board');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="new-board-form" onSubmit={handleSubmit} noValidate aria-label="Create board">
      <label htmlFor="new-board-name" className="visually-hidden">
        Board name
      </label>
      <input
        id="new-board-name"
        placeholder="Board name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'new-board-error' : undefined}
        autoFocus={autoFocus}
        data-testid="new-board-name"
      />
      <button type="submit" className="btn btn--primary" disabled={submitting} data-testid="create-board">
        Create board
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
      {error && (
        <p id="new-board-error" className="field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
