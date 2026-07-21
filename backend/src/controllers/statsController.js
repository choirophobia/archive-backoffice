const pool = require('../db/pool');
const { buildStatsQuery, buildTrendQuery, parseFilters, translateDbError } = require('../services/queryBuilder');

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

module.exports = { getStats, getTrend };
