import { FIELDS } from '../fields';

const OPERATORS = [
  { value: 'is', label: 'is' },
  { value: 'contains', label: 'contains' },
  { value: 'is_not', label: 'is not' },
];

// Controlled list of { field, operator, value } rows, AND-chained. The parent
// owns the array; rows with an empty value are kept in the UI but excluded
// from the API query by the parent.
function FilterBuilder({ filters, onChange }) {
  const updateRow = (index, patch) => {
    onChange(filters.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    onChange([...filters, { field: FIELDS[0].key, operator: 'contains', value: '' }]);
  };

  const removeRow = (index) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="filter-builder">
      {filters.map((row, index) => (
        <div className="filter-row" key={index}>
          <span className="filter-chain">{index === 0 ? 'Where' : 'and'}</span>
          <select
            value={row.field}
            onChange={(e) => updateRow(index, { field: e.target.value })}
            aria-label="Filter field"
          >
            {FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={row.operator}
            onChange={(e) => updateRow(index, { operator: e.target.value })}
            aria-label="Filter operator"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={row.value}
            placeholder="Value"
            onChange={(e) => updateRow(index, { value: e.target.value })}
            aria-label="Filter value"
          />
          <button
            type="button"
            className="filter-remove"
            onClick={() => removeRow(index)}
            aria-label="Remove filter"
            title="Remove filter"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="filter-add" onClick={addRow}>
        + Add filter
      </button>
    </div>
  );
}

export default FilterBuilder;
