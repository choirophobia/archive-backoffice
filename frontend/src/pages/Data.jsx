import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../auth.jsx';
import { useFilters } from '../filters.jsx';
import UploadPanel from '../components/UploadPanel.jsx';
import FilterBuilder from '../components/FilterBuilder.jsx';
import DataTable from '../components/DataTable.jsx';
import Pagination from '../components/Pagination.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import EditModal from '../components/EditModal.jsx';
import { apiErrorMessage } from '../fields';

const PAGE_SIZE = 20;

function formatBatchDate(value) {
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Data() {
  const { user } = useAuth();
  const canEdit = user?.role === 'superadmin';

  // Search/filter state lives in FiltersContext so the Statistics page can
  // reuse it for its "Filtered only" mode.
  const { search, setSearch, filters, setFilters, activeFilters } = useFilters();
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [totalRecords, setTotalRecords] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchesError, setBatchesError] = useState('');

  const [previewId, setPreviewId] = useState(null);
  const [editId, setEditId] = useState(null);

  // Bumped after uploads/edits/deletes to refetch the table.
  const [refreshKey, setRefreshKey] = useState(0);

  // Batch id of the most recent upload this session, so its rows render bold
  // in the table. Plain component state — a refresh or navigating away
  // resets it, which is the point (it's a "just uploaded" cue, not a label).
  const [highlightBatchId, setHighlightBatchId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtersParam = useMemo(
    () => (activeFilters.length > 0 ? JSON.stringify(activeFilters) : undefined),
    [activeFilters]
  );

  // New search/filter criteria always restart from page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filtersParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .get('/files', {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(filtersParam ? { filters: filtersParam } : {}),
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setRows(data.data);
        setTotal(data.total);
        setListError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setListError(apiErrorMessage(err, 'Failed to load records.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, filtersParam, refreshKey]);

  const refreshSidebar = useCallback(() => {
    client
      .get('/files', { params: { page: 1, limit: 1 } })
      .then(({ data }) => setTotalRecords(data.total))
      .catch(() => setTotalRecords(null));
    client
      .get('/upload-batches')
      .then(({ data }) => {
        setBatches(data);
        setBatchesError('');
      })
      .catch((err) => setBatchesError(apiErrorMessage(err, 'Failed to load upload history.')));
  }, []);

  useEffect(() => {
    refreshSidebar();
  }, [refreshSidebar]);

  const handleUploaded = (summary) => {
    setHighlightBatchId(summary?.batch_id ?? null);
    refreshSidebar();
    setRefreshKey((k) => k + 1);
  };

  const handleSaved = () => {
    setEditId(null);
    setRefreshKey((k) => k + 1);
  };

  const handleDeleted = () => {
    setEditId(null);
    refreshSidebar();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="data-page">
      <aside className="data-sidebar">
        <section className="panel">
          <h2 className="panel-title">Upload .xlsx</h2>
          <UploadPanel onUploaded={handleUploaded} />
        </section>

        <section className="panel">
          <h2 className="panel-title">Total records</h2>
          <div className="record-count">
            {totalRecords === null ? '—' : totalRecords.toLocaleString()}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Upload history</h2>
          {batchesError ? (
            <p className="panel-error">{batchesError}</p>
          ) : batches.length === 0 ? (
            <p className="panel-empty">No uploads yet.</p>
          ) : (
            <ul className="batch-list">
              {batches.map((batch) => (
                <li key={batch.id}>
                  <span className="batch-filename" title={batch.filename}>
                    {batch.filename}
                  </span>
                  <span className="batch-meta">
                    {batch.row_count} rows · {formatBatchDate(batch.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <div className="data-main">
        <h1 className="page-title">Data</h1>

        <div className="data-toolbar">
          <input
            type="search"
            className="search-input"
            placeholder="Search records…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search records"
          />
        </div>

        <FilterBuilder filters={filters} onChange={setFilters} />

        {listError && <p className="form-error">{listError}</p>}

        <DataTable
          rows={rows}
          loading={loading}
          emptyMessage={
            debouncedSearch || activeFilters.length > 0
              ? 'No records match your search or filters.'
              : 'No records yet — upload an .xlsx file to get started.'
          }
          onPreview={(row) => setPreviewId(row.id)}
          onEdit={canEdit ? (row) => setEditId(row.id) : undefined}
          highlightBatchId={highlightBatchId}
          page={page}
          limit={PAGE_SIZE}
        />

        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      {previewId && <PreviewModal id={previewId} onClose={() => setPreviewId(null)} />}
      {editId && (
        <EditModal
          id={editId}
          onClose={() => setEditId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

export default Data;
