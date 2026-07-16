const pool = require('../db/pool');
const {
  buildListQuery,
  buildUpdateQuery,
  parseFilters,
  translateDbError,
  SELECT_COLUMNS,
} = require('../services/queryBuilder');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  const err = new Error('File not found');
  err.status = 404;
  err.code = 'NOT_FOUND';
  return err;
}

async function list(req, res, next) {
  try {
    const query = buildListQuery({
      search: req.query.search,
      filters: parseFilters(req.query.filters),
      page: req.query.page,
      limit: req.query.limit,
    });

    const [countResult, dataResult] = await Promise.all([
      pool.query(query.countSql, query.countParams),
      pool.query(query.dataSql, query.dataParams),
    ]);

    res.json({
      data: dataResult.rows,
      total: countResult.rows[0].total,
      page: query.page,
      limit: query.limit,
    });
  } catch (err) {
    next(translateDbError(err));
  }
}

async function getById(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM archive_files WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) throw notFound();
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    const { sql, params } = buildUpdateQuery(req.params.id, req.body);
    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) throw notFound();
    res.json(rows[0]);
  } catch (err) {
    next(translateDbError(err));
  }
}

async function remove(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    const { rowCount } = await pool.query('DELETE FROM archive_files WHERE id = $1', [
      req.params.id,
    ]);
    if (rowCount === 0) throw notFound();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, update, remove };
