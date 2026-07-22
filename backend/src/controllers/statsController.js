const pool = require('../db/pool');
const {
  buildStatsQuery,
  buildCrosstabQuery,
  buildSummaryQuery,
  buildTrendQuery,
  parseFilters,
  translateDbError,
} = require('../services/queryBuilder');

async function getStats(req, res, next) {
  try {
    const { sql, params } = buildStatsQuery({
      dimension: req.query.dimension,
      search: req.query.search,
      filters: parseFilters(req.query.filters),
    });

    const { rows } = await pool.query(sql, params);
    res.json({
      labels: rows.map((row) => row.label),
      counts: rows.map((row) => row.count),
    });
  } catch (err) {
    next(translateDbError(err));
  }
}

async function getCrosstab(req, res, next) {
  try {
    const { sql, params } = buildCrosstabQuery({
      dimension: req.query.dimension,
      secondaryDimension: req.query.secondaryDimension,
      search: req.query.search,
      filters: parseFilters(req.query.filters),
    });

    const { rows } = await pool.query(sql, params);
    res.json({
      rows: rows.map((row) => ({ label: row.label, groupLabel: row.group_label, count: row.count })),
    });
  } catch (err) {
    next(translateDbError(err));
  }
}

async function getSummary(req, res, next) {
  try {
    const { sql, params } = buildSummaryQuery({
      search: req.query.search,
      filters: parseFilters(req.query.filters),
    });

    const { rows } = await pool.query(sql, params);
    const row = rows[0];
    res.json({
      total: row.total,
      sumBiayaDaya: row.sum_biaya_daya,
      sumTarifPnbp: row.sum_tarif_pnbp,
    });
  } catch (err) {
    next(translateDbError(err));
  }
}

async function getTrend(req, res, next) {
  try {
    const { sql, params } = buildTrendQuery({
      dateField: req.query.dateField,
      search: req.query.search,
      filters: parseFilters(req.query.filters),
    });

    const { rows } = await pool.query(sql, params);
    res.json({
      labels: rows.map((row) => row.label),
      counts: rows.map((row) => row.count),
    });
  } catch (err) {
    next(translateDbError(err));
  }
}

module.exports = { getStats, getCrosstab, getSummary, getTrend };
