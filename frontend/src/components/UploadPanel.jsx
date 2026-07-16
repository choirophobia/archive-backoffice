import { useRef, useState } from 'react';
import client from '../api/client';
import { apiErrorMessage } from '../fields';

function UploadPanel({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const upload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setSummary(null);
      setError('Only .xlsx files are accepted.');
      return;
    }

    setUploading(true);
    setError('');
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await client.post('/files/bulk-upload', formData);
      setSummary({ filename: file.name, ...data });
      onUploaded?.(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (!uploading) upload(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="upload-panel">
      <div
        className={`dropzone${dragActive ? ' drag-active' : ''}${uploading ? ' uploading' : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => upload(e.target.files?.[0])}
        />
        {uploading ? (
          <span>Uploading…</span>
        ) : (
          <span>
            <strong>Drop .xlsx here</strong> or click to browse
          </span>
        )}
      </div>

      {error && <p className="upload-error">{error}</p>}

      {summary && (
        <div className="upload-summary">
          <div className="upload-summary-file" title={summary.filename}>
            {summary.filename}
          </div>
          <ul>
            <li>
              <span>Inserted</span>
              <strong>{summary.inserted}</strong>
            </li>
            <li>
              <span>Skipped duplicates</span>
              <strong>{summary.skipped_duplicates}</strong>
            </li>
            <li>
              <span>Errors</span>
              <strong>{summary.errors?.length ?? 0}</strong>
            </li>
          </ul>
          {summary.errors?.length > 0 && (
            <details>
              <summary>Show row errors</summary>
              <ul className="upload-errors-list">
                {summary.errors.map((rowError, i) => (
                  <li key={i}>
                    {typeof rowError === 'string' ? rowError : JSON.stringify(rowError)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadPanel;
