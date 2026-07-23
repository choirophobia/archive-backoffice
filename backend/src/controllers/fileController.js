const fs = require('fs');
const pool = require('../db/pool');
const {
  buildListQuery,
  buildUpdateQuery,
  parseFilters,
  translateDbError,
  SELECT_COLUMNS,
} = require('../services/queryBuilder');
const { pdfPath, savePdf, deletePdfFile } = require('../services/pdfStorage');

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

// Uploading replaces any PDF the row already has — one attachment per record.
// The DB row is only updated once the row is confirmed to exist, so a bad id
// never leaves an orphaned file on disk.
async function uploadPdf(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No file uploaded (expected multipart field "file")', code: 'NO_FILE' },
      });
    }

    const { rows } = await pool.query(
      `UPDATE archive_files
       SET pdf_original_name = $1, pdf_size = $2, pdf_uploaded_at = now()
       WHERE id = $3
       RETURNING id, pdf_original_name, pdf_size, pdf_uploaded_at`,
      [req.file.originalname, req.file.size, req.params.id]
    );
    if (rows.length === 0) throw notFound();

    savePdf(req.params.id, req.file.buffer);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function getPdf(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    const { rows } = await pool.query('SELECT pdf_original_name FROM archive_files WHERE id = $1', [
      req.params.id,
    ]);
    if (rows.length === 0 || !rows[0].pdf_original_name) throw notFound();

    const originalName = rows[0].pdf_original_name;
    // Strip header-injection characters for the plain filename param, and
    // provide filename* so non-ASCII original names still round-trip.
    const asciiName = originalName.replace(/[\r\n"]/g, '_').replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
    );

    const stream = fs.createReadStream(pdfPath(req.params.id));
    stream.on('error', () => next(notFound()));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

async function deletePdf(req, res, next) {
  try {
    if (!UUID_RE.test(req.params.id)) throw notFound();
    const { rows } = await pool.query(
      `UPDATE archive_files
       SET pdf_original_name = NULL, pdf_size = NULL, pdf_uploaded_at = NULL
       WHERE id = $1
       RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0) throw notFound();

    deletePdfFile(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, update, remove, uploadPdf, getPdf, deletePdf };
