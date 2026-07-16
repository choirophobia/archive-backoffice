// Windowed page-number pagination with prev/next and an "X–Y of Z" readout.
function Pagination({ page, limit, total, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {from}–{to} of {total}
      </span>
      <div className="pagination-controls">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹ Prev
        </button>
        {start > 1 && (
          <>
            <button type="button" onClick={() => onPageChange(1)}>
              1
            </button>
            {start > 2 && <span className="pagination-ellipsis">…</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={p === page ? 'active' : ''}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        {end < pageCount && (
          <>
            {end < pageCount - 1 && <span className="pagination-ellipsis">…</span>}
            <button type="button" onClick={() => onPageChange(pageCount)}>
              {pageCount}
            </button>
          </>
        )}
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}

export default Pagination;
