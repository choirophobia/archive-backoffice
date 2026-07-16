import { FIELDS, formatValue } from '../fields';

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// All 37 archive columns in a horizontally scrollable table, with a sticky
// Actions column pinned to the right edge (Preview + Edit only — deleting
// lives inside EditModal).
function DataTable({
  rows,
  loading,
  emptyMessage = 'No records found.',
  onPreview,
  onEdit,
  highlightBatchId,
  page = 1,
  limit = 0,
}) {
  return (
    <div
      className={`table-wrap${loading && rows.length > 0 ? ' table-refreshing' : ''}`}
      aria-busy={loading}
    >
      <table className="data-table">
        <thead>
          <tr>
            <th className="col-no">No.</th>
            {FIELDS.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="table-empty" colSpan={FIELDS.length + 2}>
                {loading ? 'Loading…' : emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={row.id}
                className={highlightBatchId && row.batch_id === highlightBatchId ? 'row-just-uploaded' : undefined}
              >
                <td className="col-no">{(page - 1) * limit + index + 1}</td>
                {FIELDS.map((f) => (
                  <td key={f.key} title={formatValue(f, row[f.key])}>
                    {formatValue(f, row[f.key])}
                  </td>
                ))}
                <td className="col-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onPreview(row)}
                    title="Preview"
                    aria-label={`Preview ${row.no_agenda || row.id}`}
                  >
                    <EyeIcon />
                  </button>
                  {onEdit && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onEdit(row)}
                      title="Edit"
                      aria-label={`Edit ${row.no_agenda || row.id}`}
                    >
                      <PencilIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
