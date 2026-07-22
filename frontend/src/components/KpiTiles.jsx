import { formatIDR, formatMonthLabel } from '../fields';

// delta between this month's count and last month's, as a signed percentage.
// null when there's no prior month to compare against.
function monthOverMonthPct(trend) {
  if (!trend?.prev) return null;
  if (trend.prev.count === 0) return trend.current.count > 0 ? Infinity : 0;
  return ((trend.current.count - trend.prev.count) / trend.prev.count) * 100;
}

function DeltaBadge({ trend }) {
  const pct = monthOverMonthPct(trend);
  if (pct === null) return <span className="kpi-delta flat">no prior month</span>;
  if (pct === Infinity) return <span className="kpi-delta up">new this month</span>;
  const sign = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '▬';
  return (
    <span className={`kpi-delta ${sign}`}>
      {arrow} {pct >= 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

// Headline KPI row for the Statistics page: total records, the two money
// totals, month-over-month volume, and a Status Permohonan breakdown.
// Reads from the same { search, filters } scope as the charts below it.
function KpiTiles({ loading, error, total, sumBiayaDaya, sumTarifPnbp, statusBreakdown, trend }) {
  if (error) {
    return <p className="form-error">{error}</p>;
  }

  return (
    <div className={`kpi-grid${loading ? ' is-loading' : ''}`} aria-busy={loading}>
      <div className="kpi-tile">
        <span className="kpi-label">Total Records</span>
        <span className="kpi-value">{total.toLocaleString()}</span>
      </div>

      <div className="kpi-tile">
        <span className="kpi-label">Total Biaya Daya</span>
        <span className="kpi-value">{formatIDR(sumBiayaDaya)}</span>
      </div>

      <div className="kpi-tile">
        <span className="kpi-label">Total Tarif PNBP</span>
        <span className="kpi-value">{formatIDR(sumTarifPnbp)}</span>
      </div>

      <div className="kpi-tile">
        <span className="kpi-label">
          {trend ? formatMonthLabel(trend.current.label) : 'This Month'} vs Last
        </span>
        <span className="kpi-value">{trend ? trend.current.count.toLocaleString() : '—'}</span>
        {trend ? (
          <>
            <DeltaBadge trend={trend} />
            {trend.prev && (
              <span className="kpi-subtext">
                vs {trend.prev.count.toLocaleString()} in {formatMonthLabel(trend.prev.label)}
              </span>
            )}
          </>
        ) : (
          <span className="kpi-subtext">No dated records yet.</span>
        )}
      </div>

      <div className="kpi-tile kpi-tile-wide">
        <span className="kpi-label">Status Permohonan</span>
        {statusBreakdown.length === 0 ? (
          <span className="kpi-subtext">No records to summarize.</span>
        ) : (
          <ul className="kpi-breakdown">
            {statusBreakdown.map((s) => (
              <li key={s.label}>
                <span className="kpi-breakdown-label" title={s.label}>
                  {s.label}
                </span>
                <span className="kpi-breakdown-count">{s.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default KpiTiles;
