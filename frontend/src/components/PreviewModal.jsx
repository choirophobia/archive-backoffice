import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from './Modal.jsx';
import { FIELDS, formatValue, apiErrorMessage } from '../fields';

// Read-only view of a single record — fetches the full row by id.
function PreviewModal({ id, onClose }) {
  const [row, setRow] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    client
      .get(`/files/${id}`)
      .then(({ data }) => {
        if (!cancelled) setRow(data);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load record.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Modal title="Preview record" onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      {!error && !row && <p className="modal-loading">Loading…</p>}
      {row && (
        <dl className="preview-grid">
          {FIELDS.map((f) => (
            <div className="preview-item" key={f.key}>
              <dt>{f.label}</dt>
              <dd>{formatValue(f, row[f.key]) || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}

export default PreviewModal;
