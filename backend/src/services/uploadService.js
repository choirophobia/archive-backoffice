const pool = require('../db/pool');
const { parseExcel } = require('./excelParser');

const ARCHIVE_COLUMNS = [
  'status_permohonan',
  'no_agenda',
  'no_agenda_pln',
  'nidi_bangsang',
  'no_sertifikat',
  'no_registrasi',
  'tanggal_terbit',
  'tanggal_permohonan',
  'nama_pemilik',
  'nama_instalasi',
  'nama_kelurahan',
  'nama_up3',
  'nama_ulp',
  'nama_area_layanan',
  'daya',
  'biaya_daya',
  'tarif_pnbp',
  'wilayah_lit',
  'area_lit',
  'pjt',
  'tt',
  'sumber_slo',
  'metode_pembayaran',
  'telepon_pemohon_lsp',
  'nama_akun_pemohon',
  'telepon_akun_pemohon',
  'email_akun_pemohon',
  'status_penagihan',
  'status_pembatalan',
  'catatan_pembatalan',
  'nomor_tagihan',
  'tgl_tagihan',
  'kode_billing',
  'tgl_billing',
  'ntb',
  'ntpn',
  'status_pnbp',
];

// A row is a duplicate (and gets skipped) if ANY of these fields matches an
// existing value for that same field — either already in archive_files or
// earlier in the same upload file. All other columns may repeat freely.
const UNIQUE_COLUMNS = ['no_agenda', 'no_agenda_pln', 'nidi_bangsang', 'no_sertifikat', 'no_registrasi'];

// 38 params per row (batch_id + 37 columns); stay well under Postgres' 65535 cap.
const CHUNK_SIZE = 500;

function buildInsert(records, batchId) {
  const params = [];
  const tuples = records.map((record) => {
    const placeholders = [];
    params.push(batchId);
    placeholders.push(`$${params.length}`);
    for (const col of ARCHIVE_COLUMNS) {
      params.push(record[col] ?? null);
      placeholders.push(`$${params.length}`);
    }
    return `(${placeholders.join(', ')})`;
  });
  const sql = `INSERT INTO archive_files (batch_id, ${ARCHIVE_COLUMNS.join(', ')})
    VALUES ${tuples.join(', ')}`;
  return { sql, params };
}

/**
 * Parse the xlsx buffer and append its rows to archive_files under a new
 * upload batch. A row is skipped (never overwritten) if any of
 * UNIQUE_COLUMNS already has that value elsewhere in the table or earlier in
 * the same file; duplicates in every other column are allowed.
 */
async function processUpload(buffer, { uploadedBy, filename }) {
  const { rows, errors } = await parseExcel(buffer);

  // Batch row is committed independently so a failed import is still recorded
  // in the history with status 'failed'.
  const { rows: batchRows } = await pool.query(
    `INSERT INTO upload_batches (uploaded_by, filename, status)
     VALUES ($1, $2, 'pending') RETURNING id`,
    [uploadedBy, filename]
  );
  const batchId = batchRows[0].id;

  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;
  try {
    await client.query('BEGIN');

    const valuesByColumn = {};
    for (const col of UNIQUE_COLUMNS) {
      valuesByColumn[col] = [...new Set(rows.map((r) => r.record[col]).filter(Boolean))];
    }

    const existingByColumn = Object.fromEntries(UNIQUE_COLUMNS.map((col) => [col, new Set()]));
    if (UNIQUE_COLUMNS.some((col) => valuesByColumn[col].length > 0)) {
      const conditions = UNIQUE_COLUMNS.map((col, i) => `${col} = ANY($${i + 1})`).join(' OR ');
      const params = UNIQUE_COLUMNS.map((col) => valuesByColumn[col]);
      const res = await client.query(
        `SELECT ${UNIQUE_COLUMNS.join(', ')} FROM archive_files WHERE ${conditions}`,
        params
      );
      for (const row of res.rows) {
        for (const col of UNIQUE_COLUMNS) {
          if (row[col]) existingByColumn[col].add(row[col]);
        }
      }
    }

    const seenInFileByColumn = Object.fromEntries(UNIQUE_COLUMNS.map((col) => [col, new Set()]));
    const toInsert = [];
    for (const { record } of rows) {
      const isDuplicate = UNIQUE_COLUMNS.some((col) => {
        const value = record[col];
        return value && (existingByColumn[col].has(value) || seenInFileByColumn[col].has(value));
      });
      if (isDuplicate) {
        skipped += 1;
        continue;
      }
      for (const col of UNIQUE_COLUMNS) {
        const value = record[col];
        if (value) seenInFileByColumn[col].add(value);
      }
      toInsert.push(record);
    }

    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      const { sql, params } = buildInsert(chunk, batchId);
      await client.query(sql, params);
    }
    inserted = toInsert.length;

    await client.query(
      `UPDATE upload_batches SET row_count = $1, status = 'completed' WHERE id = $2`,
      [inserted, batchId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await pool
      .query(`UPDATE upload_batches SET status = 'failed' WHERE id = $1`, [batchId])
      .catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return { batch_id: batchId, inserted, skipped_duplicates: skipped, errors };
}

async function listBatches() {
  const { rows } = await pool.query(
    `SELECT id, filename, row_count, created_at
     FROM upload_batches
     ORDER BY created_at DESC`
  );
  return rows;
}

module.exports = { processUpload, listBatches, ARCHIVE_COLUMNS };
