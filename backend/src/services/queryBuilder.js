const { ARCHIVE_COLUMNS } = require('./uploadService');

// Columns the API exposes for filtering. Everything is allow-listed here so a
// filter's `field` can be interpolated into SQL safely — values always go
// through bind parameters.
const FILTERABLE_COLUMNS = new Set([...ARCHIVE_COLUMNS, 'id', 'batch_id', 'created_at', 'updated_at']);
const OPERATORS = new Set(['is', 'contains', 'is_not']);

// Chart dimensions exposed by GET /stats — allow-listed so the dimension can
// be interpolated into GROUP BY safely. status_permohonan is included for the
// Statistics page's KPI status-breakdown tile (not a dropdown chart option).
const STATS_DIMENSIONS = new Set(['area_lit', 'pjt', 'tt', 'sumber_slo', 'status_permohonan']);

// Date fields exposed by GET /stats/trend — allow-listed so the field can be
// interpolated into date_trunc() safely.
const TREND_DATE_FIELDS = new Set(['tanggal_permohonan', 'tanggal_terbit']);

// Generated/managed columns that a PUT payload may echo back (e.g. a row
// fetched via GET) but must never update.
const NON_UPDATABLE_COLUMNS = new Set(['id', 'batch_id', 'created_at', 'updated_at', 'search_index']);

const SELECT_COLUMNS = ['id', 'batch_id', ...ARCHIVE_COLUMNS, 'created_at', 'updated_at'].join(', ');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

// Date/timestamp columns are matched against the same YYYY-MM-DD rendering
// the UI shows, so searching "2025-03-01" (or just "2025-03") behaves as users
// expect instead of matching Postgres' raw timestamp text.
const DATE_SEARCH_COLUMNS = new Set([
  'tanggal_terbit',
  'tanggal_permohonan',
  'tgl_tagihan',
  'tgl_billing',
]);

// One ILIKE per archive column, all bound to the same search parameter, so the
// search box covers every one of the 37 data columns.
function buildSearchCondition(paramRef) {
  const ors = ARCHIVE_COLUMNS.map((col) =>
    DATE_SEARCH_COLUMNS.has(col)
      ? `to_char(${col}, 'YYYY-MM-DD') ILIKE ${paramRef}`
      : `${col}::text ILIKE ${paramRef}`
  );
  return `(${ors.join(' OR ')})`;
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

// Postgres invalid-input errors (bad date/number/uuid literal in a filter or
// update value) are client mistakes, not server failures.
const INVALID_INPUT_PG_CODES = new Set(['22P02', '22007', '22008', '22003']);

function translateDbError(err) {
  if (INVALID_INPUT_PG_CODES.has(err.code)) {
    const wrapped = new Error(`Invalid value: ${err.message}`);
    wrapped.status = 400;
    wrapped.code = 'INVALID_VALUE';
    return wrapped;
  }
  return err;
}

// Decode the JSON-encoded `filters` query param shared by GET /files and
// GET /stats. Shape validation happens in buildWhere.
function parseFilters(raw) {
  if (raw === undefined || raw === '') return [];
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, 'filters must be valid JSON', 'INVALID_FILTERS');
  }
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Turn { search, filters } into a parameterized WHERE clause for
 * archive_files. Search is a case-insensitive substring match ORed across all
 * archive columns; filters are AND-chained.
 */
function buildWhere({ search, filters = [] } = {}) {
  const params = [];
  const conditions = [];

  if (search && String(search).trim() !== '') {
    params.push(`%${escapeLike(String(search).trim())}%`);
    conditions.push(buildSearchCondition(`$${params.length}`));
  }

  if (!Array.isArray(filters)) {
    throw httpError(400, 'filters must be an array of { field, operator, value }', 'INVALID_FILTERS');
  }

  for (const filter of filters) {
    if (!filter || typeof filter !== 'object') {
      throw httpError(400, 'Each filter must be an object { field, operator, value }', 'INVALID_FILTERS');
    }
    const { field, operator, value } = filter;
    if (!FILTERABLE_COLUMNS.has(field)) {
      throw httpError(400, `Unknown filter field: ${JSON.stringify(field)}`, 'INVALID_FILTER_FIELD');
    }
    if (!OPERATORS.has(operator)) {
      throw httpError(400, `Unknown filter operator: ${JSON.stringify(operator)}`, 'INVALID_FILTER_OPERATOR');
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw httpError(400, `Filter value for "${field}" must be a string or number`, 'INVALID_FILTER_VALUE');
    }

    switch (operator) {
      case 'is':
        params.push(value);
        conditions.push(`${field} = $${params.length}`);
        break;
      case 'is_not':
        // IS DISTINCT FROM so NULL rows count as "not equal"
        params.push(value);
        conditions.push(`${field} IS DISTINCT FROM $${params.length}`);
        break;
      case 'contains':
        params.push(`%${escapeLike(value)}%`);
        conditions.push(`${field}::text ILIKE $${params.length}`);
        break;
    }
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Full paginated list query for GET /files: returns the data and count
 * statements sharing one WHERE clause, plus the normalized page/limit.
 */
function buildListQuery({ search, filters, page, limit } = {}) {
  const pageNum = toPositiveInt(page, 1);
  const limitNum = Math.min(toPositiveInt(limit, DEFAULT_LIMIT), MAX_LIMIT);
  const { whereSql, params } = buildWhere({ search, filters });

  const countSql = `SELECT COUNT(*)::int AS total FROM archive_files ${whereSql}`.trim();
  const dataSql = `SELECT ${SELECT_COLUMNS} FROM archive_files ${whereSql}
    ORDER BY created_at DESC, id
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  return {
    dataSql,
    dataParams: [...params, limitNum, (pageNum - 1) * limitNum],
    countSql,
    countParams: params,
    page: pageNum,
    limit: limitNum,
  };
}

/**
 * Grouped-count query for GET /stats: counts archive_files rows per value of
 * an allow-listed chart dimension, reusing the same { search, filters } WHERE
 * clause as GET /files. Ordered by count descending.
 */
function buildStatsQuery({ dimension, search, filters } = {}) {
  if (!STATS_DIMENSIONS.has(dimension)) {
    throw httpError(
      400,
      `dimension must be one of: ${[...STATS_DIMENSIONS].join(', ')}`,
      'INVALID_DIMENSION'
    );
  }

  const { whereSql, params } = buildWhere({ search, filters });
  const sql = `SELECT COALESCE(${dimension}, '(blank)') AS label, COUNT(*)::int AS count
    FROM archive_files ${whereSql}
    GROUP BY 1
    ORDER BY count DESC, label ASC`;

  return { sql, params };
}

/**
 * Two-dimension grouped-count query for GET /stats/crosstab: counts
 * archive_files rows per (dimension, secondaryDimension) pair, reusing the
 * same { search, filters } WHERE clause as GET /files. Returns flat rows —
 * folding the secondary dimension into a capped set of series (with an
 * "Other" bucket) is display logic and lives on the frontend, same as the
 * pie chart's slice folding.
 */
function buildCrosstabQuery({ dimension, secondaryDimension, search, filters } = {}) {
  if (!STATS_DIMENSIONS.has(dimension)) {
    throw httpError(
      400,
      `dimension must be one of: ${[...STATS_DIMENSIONS].join(', ')}`,
      'INVALID_DIMENSION'
    );
  }
  if (!STATS_DIMENSIONS.has(secondaryDimension)) {
    throw httpError(
      400,
      `secondaryDimension must be one of: ${[...STATS_DIMENSIONS].join(', ')}`,
      'INVALID_SECONDARY_DIMENSION'
    );
  }
  if (dimension === secondaryDimension) {
    throw httpError(400, 'secondaryDimension must differ from dimension', 'SAME_DIMENSION');
  }

  const { whereSql, params } = buildWhere({ search, filters });
  const sql = `SELECT COALESCE(${dimension}, '(blank)') AS label,
    COALESCE(${secondaryDimension}, '(blank)') AS group_label,
    COUNT(*)::int AS count
    FROM archive_files ${whereSql}
    GROUP BY 1, 2
    ORDER BY 1, 2`;

  return { sql, params };
}

/**
 * KPI summary query for GET /stats/summary: total row count plus the sum of
 * the two money columns, reusing the same { search, filters } WHERE clause as
 * GET /files. Sums are cast to float8 — precision loss is not a concern for
 * these display-only aggregate totals.
 */
function buildSummaryQuery({ search, filters } = {}) {
  const { whereSql, params } = buildWhere({ search, filters });
  const sql = `SELECT COUNT(*)::int AS total,
    COALESCE(SUM(biaya_daya), 0)::float8 AS sum_biaya_daya,
    COALESCE(SUM(tarif_pnbp), 0)::float8 AS sum_tarif_pnbp
    FROM archive_files ${whereSql}`;

  return { sql, params };
}

/**
 * Month-bucketed count query for GET /stats/trend: counts archive_files rows
 * per calendar month of an allow-listed date field, reusing the same
 * { search, filters } WHERE clause as GET /files. Rows with a null date are
 * excluded (they have no month to bucket into). Ordered chronologically.
 */
function buildTrendQuery({ dateField, search, filters } = {}) {
  if (!TREND_DATE_FIELDS.has(dateField)) {
    throw httpError(
      400,
      `dateField must be one of: ${[...TREND_DATE_FIELDS].join(', ')}`,
      'INVALID_DATE_FIELD'
    );
  }

  const { whereSql, params } = buildWhere({ search, filters });
  const notNull = `${dateField} IS NOT NULL`;
  const fullWhereSql = whereSql ? `${whereSql} AND ${notNull}` : `WHERE ${notNull}`;

  const sql = `SELECT to_char(date_trunc('month', ${dateField}), 'YYYY-MM') AS label, COUNT(*)::int AS count
    FROM archive_files ${fullWhereSql}
    GROUP BY 1
    ORDER BY 1 ASC`;

  return { sql, params };
}

/**
 * Partial-update statement for PUT /files/:id. Only allow-listed data
 * columns are set; managed columns in the payload are ignored, unknown keys
 * are rejected. Always bumps updated_at.
 */
function buildUpdateQuery(id, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw httpError(400, 'Request body must be an object of column values', 'INVALID_BODY');
  }

  const updatable = new Set(ARCHIVE_COLUMNS);
  const params = [];
  const sets = [];

  for (const [field, value] of Object.entries(patch)) {
    if (NON_UPDATABLE_COLUMNS.has(field)) continue;
    if (!updatable.has(field)) {
      throw httpError(400, `Unknown column: ${JSON.stringify(field)}`, 'INVALID_FIELD');
    }
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
      throw httpError(400, `Value for "${field}" must be a string, number, or null`, 'INVALID_VALUE');
    }
    params.push(value);
    sets.push(`${field} = $${params.length}`);
  }

  if (sets.length === 0) {
    throw httpError(400, 'No updatable fields in request body', 'EMPTY_UPDATE');
  }

  params.push(id);
  const sql = `UPDATE archive_files
    SET ${sets.join(', ')}, updated_at = now()
    WHERE id = $${params.length}
    RETURNING ${SELECT_COLUMNS}`;

  return { sql, params };
}

module.exports = {
  buildWhere,
  buildListQuery,
  buildStatsQuery,
  buildCrosstabQuery,
  buildSummaryQuery,
  buildTrendQuery,
  buildUpdateQuery,
  parseFilters,
  translateDbError,
  FILTERABLE_COLUMNS,
  SELECT_COLUMNS,
  STATS_DIMENSIONS,
  TREND_DATE_FIELDS,
};
