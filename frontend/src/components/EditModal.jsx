import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from './Modal.jsx';
import { FIELDS, formatValue, apiErrorMessage } from '../fields';

const INPUT_TYPES = { text: 'text', number: 'number', date: 'date', datetime: 'date' };

function toFormValues(row) {
  const values = {};
  for (const f of FIELDS) values[f.key] = formatValue(f, row[f.key]);
  return values;
}

// Edit form over all 37 fields. Saves only the fields that changed (empty
// string becomes null so date/number columns clear cleanly). Delete lives
// here, behind a confirm, per the "no inline delete in the table" rule.
function EditModal({ id, onClose, onSaved, onDeleted }) {
  const [initial, setInitial] = useState(null);
  const [values, setValues] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .get(`/files/${id}`)
      .then(({ data }) => {
        if (cancelled) return;
        const formValues = toFormValues(data);
        setInitial(formValues);
        setValues(formValues);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load record.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    const patch = {};
    for (const f of FIELDS) {
      if (values[f.key] !== initial[f.key]) {
        patch[f.key] = values[f.key] === '' ? null : values[f.key];
      }
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError('');
    try {
      await client.put(`/files/${id}`, patch);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save changes.'));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const label = initial?.no_agenda ? `record ${initial.no_agenda}` : 'this record';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    setDeleting(true);
    setError('');
    try {
      await client.delete(`/files/${id}`);
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete record.'));
      setDeleting(false);
    }
  };

  const busy = saving || deleting;
  // Ignore Esc/overlay/× while a save or delete is in flight so the user
  // doesn't lose the outcome (or an error message) of the request.
  const safeClose = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      title="Edit record"
      onClose={safeClose}
      footer={
        values && (
          <>
            <button
              type="button"
              className="button-danger"
              onClick={handleDelete}
              disabled={busy}
            >
              {deleting ? 'Deleting…' : 'Delete record'}
            </button>
            <div className="modal-footer-actions">
              <button type="button" className="button-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" form="edit-record-form" className="button-primary" disabled={busy}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )
      }
    >
      {error && <p className="form-error">{error}</p>}
      {!error && !values && <p className="modal-loading">Loading…</p>}
      {values && (
        <form id="edit-record-form" className="edit-grid" onSubmit={handleSave}>
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`edit-${f.key}`}>{f.label}</label>
              <input
                id={`edit-${f.key}`}
                type={INPUT_TYPES[f.type]}
                step={f.type === 'number' ? 'any' : undefined}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </form>
      )}
    </Modal>
  );
}

export default EditModal;
