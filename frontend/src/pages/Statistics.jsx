import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import BarChart from '../components/BarChart.jsx';
import PieChart from '../components/PieChart.jsx';
import { useFilters } from '../filters.jsx';
import { apiErrorMessage } from '../fields';

const DIMENSIONS = [
  { value: 'area_lit', label: 'AREA LIT' },
  { value: 'pjt', label: 'PJT' },
  { value: 'tt', label: 'TT' },
  { value: 'sumber_slo', label: 'SUMBER SLO' },
];

// Fixed categorical order (colorblind-safe as an ordered set — do not shuffle).
const PALETTE = [
  '#2a78d6', // blue
  '#008300', // green
  '#e87ba4', // magenta
  '#eda100', // yellow
  '#1baf7a', // aqua
  '#eb6834', // orange
  '#4a3aa7', // violet
  '#e34948', // red
];
const OTHER_COLOR = '#c3c2b7';
const MAX_SLICES = 8;

function Statistics() {
  const [dimension, setDimension] = useState('area_lit');
  const [mode, setMode] = useState('all'); // 'all' | 'filtered'
  const { search, activeFilters } = useFilters();

  const [labels, setLabels] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filtersParam = useMemo(
    () => (activeFilters.length > 0 ? JSON.stringify(activeFilters) : undefined),
    [activeFilters]
  );
  const searchParam = search.trim();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .get('/stats', {
        params: {
          dimension,
          ...(mode === 'filtered' && filtersParam ? { filters: filtersParam } : {}),
          ...(mode === 'filtered' && searchParam ? { search: searchParam } : {}),
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setLabels(data.labels);
        setCounts(data.counts);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setLabels([]);
        setCounts([]);
        setError(apiErrorMessage(err, 'Failed to load statistics.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dimension, mode, filtersParam, searchParam]);

  const total = useMemo(() => counts.reduce((sum, n) => sum + n, 0), [counts]);

  // Pie shows at most MAX_SLICES slices: top categories keep their fixed
  // palette slot, the tail folds into a gray "Other".
  const slices = useMemo(() => {
    const items = labels.map((label, i) => ({ label, count: counts[i] }));
    let visible = items;
    if (items.length > MAX_SLICES) {
      const head = items.slice(0, MAX_SLICES - 1);
      const otherCount = items
        .slice(MAX_SLICES - 1)
        .reduce((sum, item) => sum + item.count, 0);
      visible = [...head, { label: 'Other', count: otherCount, isOther: true }];
    }
    return visible.map((item, i) => ({
      ...item,
      color: item.isOther ? OTHER_COLOR : PALETTE[i],
      pct: total ? ((item.count / total) * 100).toFixed(1) : '0.0',
    }));
  }, [labels, counts, total]);

  const dimensionLabel = DIMENSIONS.find((d) => d.value === dimension).label;
  const filterSummary =
    activeFilters.length === 0 && !searchParam
      ? 'No search or filters are set on the Data page — showing all records.'
      : [
          activeFilters.length > 0
            ? `${activeFilters.length} filter${activeFilters.length > 1 ? 's' : ''}`
            : null,
          searchParam ? `search “${searchParam}”` : null,
        ]
          .filter(Boolean)
          .join(' + ') + ' from the Data page.';

  return (
    <div>
      <h1 className="page-title">Statistics</h1>

      <div className="stats-toolbar">
        <label className="stats-dimension">
          <span>Dimension</span>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
            {DIMENSIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <div className="segmented" role="group" aria-label="Record scope">
          <button
            type="button"
            className={mode === 'all' ? 'active' : ''}
            onClick={() => setMode('all')}
          >
            All records
          </button>
          <button
            type="button"
            className={mode === 'filtered' ? 'active' : ''}
            onClick={() => setMode('filtered')}
          >
            Filtered only
          </button>
        </div>

        {mode === 'filtered' && <span className="stats-hint">{filterSummary}</span>}
      </div>

      {error && <p className="form-error">{error}</p>}

      {!error && loading && labels.length === 0 ? (
        <p className="stats-empty">Loading…</p>
      ) : !error && !loading && total === 0 ? (
        <p className="stats-empty">No records to summarize.</p>
      ) : !error ? (
        <div className={`charts-grid${loading ? ' is-loading' : ''}`} aria-busy={loading}>
          <section className="panel">
            <h2 className="panel-title">Records by {dimensionLabel}</h2>
            <BarChart labels={labels} counts={counts} />
          </section>

          <section className="panel">
            <h2 className="panel-title">Share by {dimensionLabel}</h2>
            <PieChart slices={slices} />
            <ul className="pie-legend">
              {slices.map((slice) => (
                <li key={slice.label}>
                  <span className="legend-swatch" style={{ background: slice.color }} />
                  <span className="legend-label" title={slice.label}>
                    {slice.label}
                  </span>
                  <span className="legend-value">
                    {slice.count.toLocaleString()} · {slice.pct}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default Statistics;
