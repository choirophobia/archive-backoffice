import { useRef, useState } from 'react';
import client from '../api/client';
import { apiErrorMessage } from '../fields';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Shared PDF-attachment widget used by both PreviewModal (read-only) and
// EditModal (canManage). One PDF per record — uploading always replaces
// whatever is already attached. Upload/remove happen immediately against the
// dedicated /files/:id/pdf endpoints, same pattern as EditModal's own
// immediate "Delete record" action (not staged into the Save form).
function PdfAttachment({ id, pdfInfo, canManage, onChanged }) {
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const hasPdf = Boolean(pdfInfo?.pdf_original_name);

  const handleView = async () => {
    setViewing(true);
    setError('');
    try {
      const { data } = await client.get(`/files/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load PDF.'));
    } finally {
      setViewing(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await client.post(`/files/${id}/pdf`, form);
      onChanged(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to upload PDF.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the attached PDF? This cannot be undone.')) return;

    setBusy(true);
    setError('');
    try {
      await client.delete(`/files/${id}/pdf`);
      onChanged({ pdf_original_name: null, pdf_size: null, pdf_uploaded_at: null });
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to remove PDF.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pdf-attachment">
      {error && <p className="form-error">{error}</p>}

      {hasPdf ? (
        <div className="pdf-attachment-info">
          <button type="button" className="pdf-attachment-name" onClick={handleView} disabled={viewing}>
            {viewing ? 'Opening…' : pdfInfo.pdf_original_name}
          </button>
          <span className="pdf-attachment-meta">
            {formatBytes(pdfInfo.pdf_size)}
            {pdfInfo.pdf_uploaded_at
              ? ` · uploaded ${new Date(pdfInfo.pdf_uploaded_at).toLocaleDateString()}`
              : ''}
          </span>
        </div>
      ) : (
        <p className="panel-empty">No PDF attached.</p>
      )}

      {canManage && (
        <div className="pdf-attachment-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Working…' : hasPdf ? 'Replace PDF' : 'Upload PDF'}
          </button>
          {hasPdf && (
            <button type="button" className="button-danger" onClick={handleRemove} disabled={busy}>
              Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="pdf-attachment-input"
            onChange={handleUpload}
          />
        </div>
      )}
    </div>
  );
}

export default PdfAttachment;
