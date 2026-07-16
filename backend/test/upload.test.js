process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const pool = require('../src/db/pool');
const app = require('../src/app');
const { parseExcel } = require('../src/services/excelParser');
const { generateToken } = require('../src/services/authService');

const TEST_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'test@example.com' };

async function buildXlsx(headers, dataRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  for (const row of dataRows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function uploadFile(server, buffer, { token, filename = 'data.xlsx' } = {}) {
  const { port } = server.address();
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  const res = await fetch(`http://127.0.0.1:${port}/files/bulk-upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('parseExcel maps headers and normalizes dates and numbers', async () => {
  const buffer = await buildXlsx(
    ['NO AGENDA', 'NAMA PEMILIK', 'TANGGAL TERBIT', 'TANGGAL PERMOHONAN', 'TGL BILLING', 'BIAYA DAYA'],
    [
      // Date object, dd/mm/yyyy string, Excel serial (45306 = 2024-01-15), id-style number
      ['AG-001', 'Budi', new Date(Date.UTC(2024, 0, 15)), '15/01/2024', 45306, '1.500.000,50'],
      ['AG-002', 'Sari', '2024-02-01', null, null, 250000],
    ]
  );

  const { rows, errors } = await parseExcel(buffer);

  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].record, {
    no_agenda: 'AG-001',
    nama_pemilik: 'Budi',
    tanggal_terbit: '2024-01-15',
    tanggal_permohonan: '2024-01-15',
    tgl_billing: '2024-01-15',
    biaya_daya: 1500000.5,
  });
  assert.equal(rows[1].record.tanggal_terbit, '2024-02-01');
  assert.equal(rows[1].record.biaya_daya, 250000);
});

test('parseExcel reports a row error for an unparseable date and keeps other rows', async () => {
  const buffer = await buildXlsx(
    ['NO AGENDA', 'TANGGAL TERBIT'],
    [
      ['AG-001', 'not-a-date'],
      ['AG-002', '2024-03-10'],
    ]
  );

  const { rows, errors } = await parseExcel(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].record.no_agenda, 'AG-002');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].row, 2);
  assert.match(errors[0].message, /tanggal_terbit/);
});

test('POST /files/bulk-upload inserts rows, skips duplicates, returns summary', async (t) => {
  const buffer = await buildXlsx(
    ['NO AGENDA', 'NAMA PEMILIK'],
    [
      ['DUP-1', 'Already in DB'],
      ['NEW-1', 'First'],
      ['NEW-1', 'In-file duplicate'],
      ['NEW-2', 'Second'],
    ]
  );

  const insertedParams = [];
  const fakeClient = {
    async query(sql, params) {
      if (/SELECT no_agenda, no_agenda_pln/.test(sql)) return { rows: [{ no_agenda: 'DUP-1' }] };
      if (/INSERT INTO archive_files/.test(sql)) {
        insertedParams.push(params);
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };

  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = async (sql) => {
    if (/INSERT INTO upload_batches/.test(sql)) return { rows: [{ id: 'batch-123' }] };
    return { rows: [] };
  };
  pool.connect = async () => fakeClient;
  t.after(() => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const { status, body } = await uploadFile(server, buffer, { token });

  assert.equal(status, 200);
  assert.deepEqual(body, {
    batch_id: 'batch-123',
    inserted: 2,
    skipped_duplicates: 2,
    errors: [],
  });
  // one chunked INSERT with 38 params per row (batch_id + 37 columns)
  assert.equal(insertedParams.length, 1);
  assert.equal(insertedParams[0].length, 2 * 38);
});

test('POST /files/bulk-upload skips rows that duplicate any of the 5 key columns, allows duplicates elsewhere', async (t) => {
  const buffer = await buildXlsx(
    ['NO AGENDA', 'NO AGENDA PLN', 'NIDI BANGSANG', 'NO SERTIFIKAT', 'NO REGISTRASI', 'NAMA PEMILIK'],
    [
      // no_agenda_pln collides with an existing DB row -> skipped
      ['AG-NEW-1', 'PLN-DUP', '', '', '', 'Same name'],
      // nidi_bangsang collides with an earlier row in this same file -> skipped
      ['AG-NEW-2', '', 'NIDI-DUP', '', '', 'Same name'],
      ['AG-NEW-3', '', 'NIDI-DUP', '', '', 'Same name'],
      // no non-key duplicate against 'Same name' above matters -> inserted
      ['AG-NEW-4', '', '', '', '', 'Same name'],
    ]
  );

  const insertedParams = [];
  const fakeClient = {
    async query(sql, params) {
      if (/SELECT no_agenda, no_agenda_pln/.test(sql)) {
        return { rows: [{ no_agenda: null, no_agenda_pln: 'PLN-DUP', nidi_bangsang: null, no_sertifikat: null, no_registrasi: null }] };
      }
      if (/INSERT INTO archive_files/.test(sql)) {
        insertedParams.push(params);
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };

  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = async (sql) => {
    if (/INSERT INTO upload_batches/.test(sql)) return { rows: [{ id: 'batch-456' }] };
    return { rows: [] };
  };
  pool.connect = async () => fakeClient;
  t.after(() => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const { status, body } = await uploadFile(server, buffer, { token });

  assert.equal(status, 200);
  assert.deepEqual(body, {
    batch_id: 'batch-456',
    inserted: 2,
    skipped_duplicates: 2,
    errors: [],
  });
  assert.equal(insertedParams.length, 1);
  assert.equal(insertedParams[0].length, 2 * 38);
});

test('POST /files/bulk-upload rejects non-xlsx files with 400', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const { status, body } = await uploadFile(server, Buffer.from('plain text'), {
    token,
    filename: 'data.csv',
  });

  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_FILE_TYPE');
});

test('POST /files/bulk-upload returns 401 without a token', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const { status, body } = await uploadFile(server, Buffer.from('x'));

  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('GET /upload-batches returns history with a token, 401 without', async (t) => {
  const batches = [
    { id: 'b1', filename: 'jan.xlsx', row_count: 10, created_at: '2026-01-05T00:00:00.000Z' },
  ];
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (/FROM upload_batches/.test(sql)) return { rows: batches };
    return { rows: [] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());
  const { port } = server.address();

  const unauthorized = await fetch(`http://127.0.0.1:${port}/upload-batches`);
  assert.equal(unauthorized.status, 401);

  const token = generateToken(TEST_USER);
  const res = await fetch(`http://127.0.0.1:${port}/upload-batches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), batches);
});
