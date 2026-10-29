interface FilterBarProps {
  assignees: string[];
  value: string;
  onChange: (assignee: string) => void;
}

export function FilterBar({ assignees, value, onChange }: FilterBarProps) {
  // Keep the active filter selectable even if no task is assigned to it any more.
  const options = value && !assignees.includes(value) ? [...assignees, value] : assignees;
  return (
    <div className="filter-bar" role="search" aria-label="Filter tasks">
      <label htmlFor="assignee-filter">Assignee</label>
      <select
        id="assignee-filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid="assignee-filter"
      >
        <option value="">All assignees</option>
        {options.map((assignee) => (
          <option key={assignee} value={assignee}>
            {assignee}
          </option>
        ))}
      </select>
      {value && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange('')} data-testid="clear-filter">
          Clear filter
        </button>
      )}
    </div>
  );
}
