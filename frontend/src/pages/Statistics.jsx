import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import BarChart from '../components/BarChart.jsx';
import PieChart from '../components/PieChart.jsx';
import TrendChart from '../components/TrendChart.jsx';
import GroupedBarChart from '../components/GroupedBarChart.jsx';
import KpiTiles from '../components/KpiTiles.jsx';
import { useFilters } from '../filters.jsx';
import { apiErrorMessage } from '../fields';

const DIMENSIONS = [
  { value: 'area_lit', label: 'AREA LIT' },
  { value: 'pjt', label: 'PJT' },
  { value: 'tt', label: 'TT' },
  { value: 'sumber_slo', label: 'SUMBER SLO' },
];

const DATE_FIELDS = [
  { value: 'tanggal_permohonan', label: 'Tanggal Permohonan' },
  { value: 'tanggal_terbit', label: 'Tanggal Terbit' },
];

// Options for the secondary "Break down by" dimension — the four chart
// dimensions plus status_permohonan (also used for the KPI status tile).
const BREAKDOWN_DIMENSIONS = [...DIMENSIONS, { value: 'status_permohonan', label: 'STATUS PERMOHONAN' }];
const MAX_BREAKDOWN_SERIES = 6;
const COMPARE_ALL_COLOR = '#a9acc4';
const COMPARE_FILTERED_COLOR = '#4f46e5';

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
  const [mode, setMode] = useState('all'); // 'all' | 'filtered' | 'compare'
  const { search, activeFilters } = useFilters();

  const [labels, setLabels] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [secondaryDimension, setSecondaryDimension] = useState('');
  const [crosstabRows, setCrosstabRows] = useState([]);
  const [crosstabLoading, setCrosstabLoading] = useState(false);
  const [crosstabError, setCrosstabError] = useState('');

  const [compareCounts, setCompareCounts] = useState([]);
  const [compareLabels, setCompareLabels] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');

  const [dateField, setDateField] = useState('tanggal_permohonan');
  const [trendLabels, setTrendLabels] = useState([]);
  const [trendCounts, setTrendCounts] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');

  const [summary, setSummary] = useState({ total: 0, sumBiayaDaya: 0, sumTarifPnbp: 0 });
  const [statusBreakdown, setStatusBreakdown] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState('');

  const filtersParam = useMemo(
    () => (activeFilters.length > 0 ? JSON.stringify(activeFilters) : undefined),
    [activeFilters]
  );
  const searchParam = search.trim();
  const scoped = mode !== 'all';

  // "Break down by" and "Compare" both replace the Records-by-dimension bar
  // panel with a different multi-series chart — keep them mutually exclusive
  // rather than trying to render both at once.
  useEffect(() => {
    if (mode === 'compare') setSecondaryDimension('');
  }, [mode]);

  useEffect(() => {
    if (secondaryDimension) setMode((m) => (m === 'compare' ? 'filtered' : m));
  }, [secondaryDimension]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .get('/stats', {
        params: {
          dimension,
          ...(scoped && filtersParam ? { filters: filtersParam } : {}),
          ...(scoped && searchParam ? { search: searchParam } : {}),
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
  }, [dimension, scoped, filtersParam, searchParam]);

  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    client
      .get('/stats/trend', {
        params: {
          dateField,
          ...(scoped && filtersParam ? { filters: filtersParam } : {}),
          ...(scoped && searchParam ? { search: searchParam } : {}),
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setTrendLabels(data.labels);
        setTrendCounts(data.counts);
        setTrendError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTrendLabels([]);
        setTrendCounts([]);
        setTrendError(apiErrorMessage(err, 'Failed to load trend.'));
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateField, scoped, filtersParam, searchParam]);

  useEffect(() => {
    let cancelled = false;
    setKpiLoading(true);
    const params = {
      ...(scoped && filtersParam ? { filters: filtersParam } : {}),
      ...(scoped && searchParam ? { search: searchParam } : {}),
    };
    Promise.all([
      client.get('/stats/summary', { params }),
      client.get('/stats', { params: { ...params, dimension: 'status_permohonan' } }),
    ])
      .then(([summaryRes, statusRes]) => {
        if (cancelled) return;
        setSummary(summaryRes.data);
        setStatusBreakdown(
          statusRes.data.labels.map((label, i) => ({ label, count: statusRes.data.counts[i] }))
        );
        setKpiError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatusBreakdown([]);
        setKpiError(apiErrorMessage(err, 'Failed to load summary.'));
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scoped, filtersParam, searchParam]);

  // "Break down by": a second dimension for the Records-by-dimension panel,
  // rendered as a stacked bar instead of the flat single-series one.
  useEffect(() => {
    if (!secondaryDimension) {
      setCrosstabRows([]);
      setCrosstabError('');
      return;
    }
    let cancelled = false;
    setCrosstabLoading(true);
    client
      .get('/stats/crosstab', {
        params: {
          dimension,
          secondaryDimension,
          ...(scoped && filtersParam ? { filters: filtersParam } : {}),
          ...(scoped && searchParam ? { search: searchParam } : {}),
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setCrosstabRows(data.rows);
        setCrosstabError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setCrosstabRows([]);
        setCrosstabError(apiErrorMessage(err, 'Failed to load breakdown.'));
      })
      .finally(() => {
        if (!cancelled) setCrosstabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dimension, secondaryDimension, scoped, filtersParam, searchParam]);

  // "Compare": the same dimension fetched with no search/filters, so the Bar
  // panel can show All records alongside the current Filtered set.
  useEffect(() => {
    if (mode !== 'compare') {
      setCompareLabels([]);
      setCompareCounts([]);
      setCompareError('');
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    client
      .get('/stats', { params: { dimension } })
      .then(({ data }) => {
        if (cancelled) return;
        setCompareLabels(data.labels);
        setCompareCounts(data.counts);
        setCompareError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setCompareLabels([]);
        setCompareCounts([]);
        setCompareError(apiErrorMessage(err, 'Failed to load comparison.'));
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dimension, mode]);

  const total = useMemo(() => counts.reduce((sum, n) => sum + n, 0), [counts]);
  const trendTotal = useMemo(() => trendCounts.reduce((sum, n) => sum + n, 0), [trendCounts]);

  // This-month-vs-last derived from the trend series already being fetched
  // above, so the KPI tile always matches whichever date field is selected
  // in the "Trend by" dropdown.
  const monthTrend = useMemo(() => {
    if (trendLabels.length === 0) return null;
    const lastIdx = trendLabels.length - 1;
    const current = { label: trendLabels[lastIdx], count: trendCounts[lastIdx] };
    const prev =
      lastIdx > 0 ? { label: trendLabels[lastIdx - 1], count: trendCounts[lastIdx - 1] } : null;
    return { current, prev };
  }, [trendLabels, trendCounts]);

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

  // Two-dimension breakdown for the stacked bar: primary categories ordered
  // by total count desc, secondary series capped to MAX_BREAKDOWN_SERIES
  // with the tail folded into "Other" — same folding rule as the pie slices.
  const crosstab = useMemo(() => {
    if (!secondaryDimension || crosstabRows.length === 0) return null;

    const primaryTotals = new Map();
    const secondaryTotals = new Map();
    for (const { label, groupLabel, count } of crosstabRows) {
      primaryTotals.set(label, (primaryTotals.get(label) || 0) + count);
      secondaryTotals.set(groupLabel, (secondaryTotals.get(groupLabel) || 0) + count);
    }

    const primaryLabels = [...primaryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const secondaryRanked = [...secondaryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);

    const topSecondary =
      secondaryRanked.length > MAX_BREAKDOWN_SERIES
        ? secondaryRanked.slice(0, MAX_BREAKDOWN_SERIES - 1)
        : secondaryRanked;
    const hasOther = secondaryRanked.length > topSecondary.length;
    const topSet = new Set(topSecondary);
    const secondaryLabels = hasOther ? [...topSecondary, 'Other'] : topSecondary;

    const grid = new Map(primaryLabels.map((p) => [p, new Map()]));
    for (const { label, groupLabel, count } of crosstabRows) {
      const bucket = topSet.has(groupLabel) ? groupLabel : 'Other';
      const row = grid.get(label);
      row.set(bucket, (row.get(bucket) || 0) + count);
    }

    const series = secondaryLabels.map((secLabel, i) => ({
      label: secLabel,
      color: secLabel === 'Other' ? OTHER_COLOR : PALETTE[i],
      counts: primaryLabels.map((priLabel) => grid.get(priLabel).get(secLabel) || 0),
    }));

    return { primaryLabels, series };
  }, [crosstabRows, secondaryDimension]);

  // All vs Filtered comparison: "All" labels are a superset of "Filtered"
  // labels (filtering only removes rows), so All's desc-count order is used
  // as the category order and Filtered counts are looked up per label.
  const compareSeries = useMemo(() => {
    if (mode !== 'compare' || compareLabels.length === 0) return null;
    const filteredMap = new Map(labels.map((l, i) => [l, counts[i]]));
    return {
      primaryLabels: compareLabels,
      series: [
        { label: 'All records', color: COMPARE_ALL_COLOR, counts: compareCounts },
        {
          label: 'Filtered',
          color: COMPARE_FILTERED_COLOR,
          counts: compareLabels.map((l) => filteredMap.get(l) || 0),
        },
      ],
    };
  }, [mode, compareLabels, compareCounts, labels, counts]);

  const dimensionLabel = DIMENSIONS.find((d) => d.value === dimension).label;
  const dateFieldLabel = DATE_FIELDS.find((d) => d.value === dateField).label;
  const secondaryDimensionLabel = BREAKDOWN_DIMENSIONS.find((d) => d.value === secondaryDimension)?.label;
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

      <KpiTiles
        loading={kpiLoading}
        error={kpiError}
        total={summary.total}
        sumBiayaDaya={summary.sumBiayaDaya}
        sumTarifPnbp={summary.sumTarifPnbp}
        statusBreakdown={statusBreakdown}
        trend={monthTrend}
      />

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

        <label className="stats-dimension">
          <span>Break down by</span>
          <select value={secondaryDimension} onChange={(e) => setSecondaryDimension(e.target.value)}>
            <option value="">None</option>
            {BREAKDOWN_DIMENSIONS.filter((d) => d.value !== dimension).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="stats-dimension">
          <span>Trend by</span>
          <select value={dateField} onChange={(e) => setDateField(e.target.value)}>
            {DATE_FIELDS.map((d) => (
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
          <button
            type="button"
            className={mode === 'compare' ? 'active' : ''}
            disabled={activeFilters.length === 0 && !searchParam}
            title={
              activeFilters.length === 0 && !searchParam
                ? 'Set a search or filter on the Data page first'
                : undefined
            }
            onClick={() => setMode('compare')}
          >
            Compare
          </button>
        </div>

        {mode !== 'all' && <span className="stats-hint">{filterSummary}</span>}
      </div>

      <section className={`panel trend-panel${trendLoading ? ' is-loading' : ''}`} aria-busy={trendLoading}>
        <h2 className="panel-title">Records over time by {dateFieldLabel}</h2>
        {trendError ? (
          <p className="form-error">{trendError}</p>
        ) : trendLoading && trendLabels.length === 0 ? (
          <p className="stats-empty">Loading…</p>
        ) : !trendLoading && trendTotal === 0 ? (
          <p className="stats-empty">No dated records to summarize.</p>
        ) : (
          <TrendChart labels={trendLabels} counts={trendCounts} />
        )}
      </section>

      {error && <p className="form-error">{error}</p>}

      {!error && loading && labels.length === 0 ? (
        <p className="stats-empty">Loading…</p>
      ) : !error && !loading && total === 0 ? (
        <p className="stats-empty">No records to summarize.</p>
      ) : !error ? (
        <div className={`charts-grid${loading ? ' is-loading' : ''}`} aria-busy={loading}>
          <section className={`panel${(crosstabLoading || compareLoading) ? ' is-loading' : ''}`}>
            <h2 className="panel-title">
              Records by {dimensionLabel}
              {crosstab ? ` × ${secondaryDimensionLabel}` : ''}
              {compareSeries ? ' — All vs Filtered' : ''}
            </h2>
            {crosstabError && <p className="form-error">{crosstabError}</p>}
            {compareError && <p className="form-error">{compareError}</p>}
            {compareSeries ? (
              <GroupedBarChart
                key="compare"
                primaryLabels={compareSeries.primaryLabels}
                series={compareSeries.series}
                stacked={false}
              />
            ) : crosstab ? (
              <GroupedBarChart
                key="crosstab"
                primaryLabels={crosstab.primaryLabels}
                series={crosstab.series}
                stacked
              />
            ) : (
              <BarChart labels={labels} counts={counts} />
            )}
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
