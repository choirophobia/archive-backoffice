process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/unused';
process.env.PDF_STORAGE_DIR =
  process.env.PDF_STORAGE_DIR || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'slo-pdf-'));

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../src/db/pool');
const app = require('../src/app');
const { generateToken } = require('../src/services/authService');
const { buildWhere, buildListQuery, buildUpdateQuery } = require('../src/services/queryBuilder');
const { pdfPath } = require('../src/services/pdfStorage');

const TEST_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'test@example.com',
  role: 'superadmin',
};
const KARYAWAN_USER = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'karyawan@example.com',
  role: 'karyawan',
};
const ROW_ID = '22222222-2222-2222-2222-222222222222';

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, path, { method = 'GET', token, body } = {}) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function uploadPdfFile(server, path, buffer, { token, filename = 'doc.pdf' } = {}) {
  const { port } = server.address();
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// --- queryBuilder unit tests ---

test('buildWhere combines search and filters with AND, all parameterized', () => {
  const { whereSql, params } = buildWhere({
    search: 'budi',
    filters: [
      { field: 'area_lit', operator: 'is', value: 'JAKARTA' },
      { field: 'nama_pemilik', operator: 'contains', value: '50%_x' },
      { field: 'pjt', operator: 'is_not', value: 'PT X' },
    ],
  });

  // Search is one ILIKE per archive column, all bound to $1 — spot-check a
  // formerly non-searchable column and the date rendering.
  assert.ok(whereSql.startsWith('WHERE ('));
  assert.match(whereSql, /no_agenda::text ILIKE \$1/);
  assert.match(whereSql, /kode_billing::text ILIKE \$1/);
  assert.match(whereSql, /to_char\(tanggal_terbit, 'YYYY-MM-DD'\) ILIKE \$1/);
  assert.match(whereSql, /\) AND area_lit = \$2 AND nama_pemilik::text ILIKE \$3 AND pjt IS DISTINCT FROM \$4$/);
  // ILIKE wildcards in user input are escaped
  assert.deepEqual(params, ['%budi%', 'JAKARTA', '%50\\%\\_x%', 'PT X']);
});

test('buildWhere rejects non-allow-listed field names', () => {
  assert.throws(
    () => buildWhere({ filters: [{ field: 'id; DROP TABLE users--', operator: 'is', value: 'x' }] }),
    (err) => err.status === 400 && err.code === 'INVALID_FILTER_FIELD'
  );
  assert.throws(
    () => buildWhere({ filters: [{ field: 'search_index', operator: 'is', value: 'x' }] }),
    (err) => err.code === 'INVALID_FILTER_FIELD'
  );
  assert.throws(
    () => buildWhere({ filters: [{ field: 'area_lit', operator: 'like', value: 'x' }] }),
    (err) => err.code === 'INVALID_FILTER_OPERATOR'
  );
});

test('buildListQuery paginates and defaults/clamps page and limit', () => {
  const q = buildListQuery({ page: '3', limit: '25' });
  assert.match(q.dataSql, /LIMIT \$1 OFFSET \$2/);
  assert.deepEqual(q.dataParams, [25, 50]);
  assert.deepEqual(q.countParams, []);

  const defaults = buildListQuery({});
  assert.equal(defaults.page, 1);
  assert.equal(defaults.limit, 20);

  const clamped = buildListQuery({ page: '-1', limit: '9999' });
  assert.equal(clamped.page, 1);
  assert.equal(clamped.limit, 200);
});

test('buildUpdateQuery sets only allow-listed columns and bumps updated_at', () => {
  const { sql, params } = buildUpdateQuery(ROW_ID, {
    nama_pemilik: 'Budi',
    biaya_daya: 1000,
    catatan_pembatalan: null,
    id: 'ignored',
    created_at: 'ignored',
  });

  assert.match(sql, /SET nama_pemilik = \$1, biaya_daya = \$2, catatan_pembatalan = \$3, updated_at = now\(\)/);
  assert.match(sql, /WHERE id = \$4/);
  assert.deepEqual(params, ['Budi', 1000, null, ROW_ID]);

  assert.throws(
    () => buildUpdateQuery(ROW_ID, { nonsense_column: 'x' }),
    (err) => err.status === 400 && err.code === 'INVALID_FIELD'
  );
  assert.throws(
    () => buildUpdateQuery(ROW_ID, { id: 'only-managed-fields' }),
    (err) => err.code === 'EMPTY_UPDATE'
  );
});

// --- route tests (mocked pool) ---

test('GET /files returns paginated envelope and passes search/filters to SQL', async (t) => {
  const queries = [];
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: 42 }] };
    return { rows: [{ id: ROW_ID, nama_pemilik: 'Budi' }] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const filters = encodeURIComponent(JSON.stringify([{ field: 'area_lit', operator: 'is', value: 'JAKARTA' }]));
  const { status, body } = await request(server, `/files?page=2&limit=10&search=budi&filters=${filters}`, { token });

  assert.equal(status, 200);
  assert.deepEqual(body, {
    data: [{ id: ROW_ID, nama_pemilik: 'Budi' }],
    total: 42,
    page: 2,
    limit: 10,
  });

  const dataQuery = queries.find((q) => /ORDER BY/.test(q.sql));
  assert.match(dataQuery.sql, /kode_billing::text ILIKE \$1/);
  assert.match(dataQuery.sql, /area_lit = \$2/);
  assert.deepEqual(dataQuery.params, ['%budi%', 'JAKARTA', 10, 10]);
});

test('GET /files rejects bad filters JSON and unknown fields with 400', async (t) => {
  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const badJson = await request(server, '/files?filters=not-json', { token });
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, 'INVALID_FILTERS');

  const badField = encodeURIComponent(JSON.stringify([{ field: 'evil', operator: 'is', value: 'x' }]));
  const res = await request(server, `/files?filters=${badField}`, { token });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_FILTER_FIELD');
});

test('GET /files/:id returns the row, 404 when missing or malformed id', async (t) => {
  const originalQuery = pool.query;
  pool.query = async (sql, params) =>
    params[0] === ROW_ID ? { rows: [{ id: ROW_ID, nama_pemilik: 'Budi' }] } : { rows: [] };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const found = await request(server, `/files/${ROW_ID}`, { token });
  assert.equal(found.status, 200);
  assert.equal(found.body.id, ROW_ID);

  const missing = await request(server, '/files/33333333-3333-3333-3333-333333333333', { token });
  assert.equal(missing.status, 404);

  const malformed = await request(server, '/files/not-a-uuid', { token });
  assert.equal(malformed.status, 404);
});

test('PUT /files/:id updates allowed fields and returns the updated row', async (t) => {
  let captured;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ id: ROW_ID, nama_pemilik: 'Updated' }] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const { status, body } = await request(server, `/files/${ROW_ID}`, {
    method: 'PUT',
    token,
    body: { nama_pemilik: 'Updated' },
  });

  assert.equal(status, 200);
  assert.equal(body.nama_pemilik, 'Updated');
  assert.match(captured.sql, /updated_at = now\(\)/);
  assert.deepEqual(captured.params, ['Updated', ROW_ID]);
});

test('DELETE /files/:id returns success, 404 when the row does not exist', async (t) => {
  const originalQuery = pool.query;
  pool.query = async (sql, params) => ({ rowCount: params[0] === ROW_ID ? 1 : 0, rows: [] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const ok = await request(server, `/files/${ROW_ID}`, { method: 'DELETE', token });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { success: true });

  const missing = await request(server, '/files/33333333-3333-3333-3333-333333333333', {
    method: 'DELETE',
    token,
  });
  assert.equal(missing.status, 404);
});

test('GET /files requires auth', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const { status } = await request(server, '/files');
  assert.equal(status, 401);
});

test('PUT and DELETE /files/:id return 403 for a karyawan (non-superadmin) role', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ id: ROW_ID }], rowCount: 1 });
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(KARYAWAN_USER);

  const put = await request(server, `/files/${ROW_ID}`, {
    method: 'PUT',
    token,
    body: { nama_pemilik: 'Nope' },
  });
  assert.equal(put.status, 403);
  assert.equal(put.body.error.code, 'FORBIDDEN');

  const del = await request(server, `/files/${ROW_ID}`, { method: 'DELETE', token });
  assert.equal(del.status, 403);
  assert.equal(del.body.error.code, 'FORBIDDEN');
});

test('GET /files/:id is readable by a karyawan (preview allowed, edit is not)', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ id: ROW_ID, nama_pemilik: 'Budi' }] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(KARYAWAN_USER);

  const { status, body } = await request(server, `/files/${ROW_ID}`, { token });
  assert.equal(status, 200);
  assert.equal(body.id, ROW_ID);
});

// --- PDF attachment routes ---

test('POST /files/:id/pdf stores the file and records metadata; rejects non-pdf and karyawan', async (t) => {
  let captured;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ id: ROW_ID, pdf_original_name: 'doc.pdf', pdf_size: 4, pdf_uploaded_at: '2026-01-01T00:00:00.000Z' }] };
  };
  t.after(() => {
    pool.query = originalQuery;
    fs.rmSync(pdfPath(ROW_ID), { force: true });
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const { status, body } = await uploadPdfFile(server, `/files/${ROW_ID}/pdf`, Buffer.from('%PDF-1.4'), { token });
  assert.equal(status, 200);
  assert.equal(body.pdf_original_name, 'doc.pdf');
  assert.match(captured.sql, /SET pdf_original_name = \$1, pdf_size = \$2, pdf_uploaded_at = now\(\)/);
  assert.deepEqual(captured.params, ['doc.pdf', 8, ROW_ID]);
  assert.ok(fs.existsSync(pdfPath(ROW_ID)));

  const badType = await uploadPdfFile(server, `/files/${ROW_ID}/pdf`, Buffer.from('not a pdf'), {
    token,
    filename: 'doc.txt',
  });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error.code, 'INVALID_FILE_TYPE');

  const karyawanToken = generateToken(KARYAWAN_USER);
  const forbidden = await uploadPdfFile(server, `/files/${ROW_ID}/pdf`, Buffer.from('%PDF-1.4'), {
    token: karyawanToken,
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'FORBIDDEN');
});

test('POST /files/:id/pdf returns 404 for a missing row and does not write a file', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);
  const missingId = '33333333-3333-3333-3333-333333333333';

  const { status } = await uploadPdfFile(server, `/files/${missingId}/pdf`, Buffer.from('%PDF-1.4'), { token });
  assert.equal(status, 404);
  assert.equal(fs.existsSync(pdfPath(missingId)), false);
});

test('GET /files/:id/pdf streams the stored file for any role, 404 when none is attached', async (t) => {
  fs.writeFileSync(pdfPath(ROW_ID), 'hello pdf');
  const originalQuery = pool.query;
  pool.query = async (sql, params) =>
    params[0] === ROW_ID ? { rows: [{ pdf_original_name: 'doc.pdf' }] } : { rows: [{ pdf_original_name: null }] };
  t.after(() => {
    pool.query = originalQuery;
    fs.rmSync(pdfPath(ROW_ID), { force: true });
  });

  const server = await listen();
  t.after(() => server.close());
  const { port } = server.address();
  const karyawanToken = generateToken(KARYAWAN_USER);

  const res = await fetch(`http://127.0.0.1:${port}/files/${ROW_ID}/pdf`, {
    headers: { Authorization: `Bearer ${karyawanToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(await res.text(), 'hello pdf');

  const other = '55555555-5555-5555-5555-555555555555';
  const none = await fetch(`http://127.0.0.1:${port}/files/${other}/pdf`, {
    headers: { Authorization: `Bearer ${karyawanToken}` },
  });
  assert.equal(none.status, 404);
});

test('DELETE /files/:id/pdf removes the file and clears metadata; 403 for karyawan', async (t) => {
  fs.writeFileSync(pdfPath(ROW_ID), 'hello pdf');
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ id: ROW_ID }] });
  t.after(() => {
    pool.query = originalQuery;
    fs.rmSync(pdfPath(ROW_ID), { force: true });
  });

  const server = await listen();
  t.after(() => server.close());
  const karyawanToken = generateToken(KARYAWAN_USER);
  const forbidden = await request(server, `/files/${ROW_ID}/pdf`, { method: 'DELETE', token: karyawanToken });
  assert.equal(forbidden.status, 403);

  const token = generateToken(TEST_USER);
  const ok = await request(server, `/files/${ROW_ID}/pdf`, { method: 'DELETE', token });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { success: true });
  assert.equal(fs.existsSync(pdfPath(ROW_ID)), false);
});
