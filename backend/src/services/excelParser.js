const ExcelJS = require('exceljs');

// Exact source headers from CLAUDE.md, normalized to uppercase for lookup.
const COLUMN_MAP = {
  'STATUS PERMOHONAN': 'status_permohonan',
  'NO AGENDA': 'no_agenda',
  'NO AGENDA PLN': 'no_agenda_pln',
  'NIDI BANGSANG': 'nidi_bangsang',
  'NO SERTIFIKAT': 'no_sertifikat',
  'NO REGISTRASI': 'no_registrasi',
  'TANGGAL TERBIT': 'tanggal_terbit',
  'TANGGAL PERMOHONAN': 'tanggal_permohonan',
  'NAMA PEMILIK': 'nama_pemilik',
  'NAMA INSTALASI': 'nama_instalasi',
  'NAMA KELURAHAN': 'nama_kelurahan',
  'NAMA UP3': 'nama_up3',
  'NAMA ULP': 'nama_ulp',
  'NAMA AREA LAYANAN': 'nama_area_layanan',
  'DAYA': 'daya',
  'BIAYA DAYA': 'biaya_daya',
  'TARIF PNBP': 'tarif_pnbp',
  'WILAYAH LIT': 'wilayah_lit',
  'AREA LIT': 'area_lit',
  'PJT': 'pjt',
  'TT': 'tt',
  'SUMBER SLO': 'sumber_slo',
  'METODE PEMBAYARAN': 'metode_pembayaran',
  'TELEPON PEMOHON LSP': 'telepon_pemohon_lsp',
  'NAMA AKUN PEMOHON': 'nama_akun_pemohon',
  'TELEPON AKUN PEMOHON': 'telepon_akun_pemohon',
  'EMAIL AKUN PEMOHON': 'email_akun_pemohon',
  'STATUS PENAGIHAN': 'status_penagihan',
  'STATUS PEMBATALAN': 'status_pembatalan',
  'CATATAN PEMBATALAN': 'catatan_pembatalan',
  'NOMOR TAGIHAN': 'nomor_tagihan',
  'TGL TAGIHAN': 'tgl_tagihan',
  'KODE BILLING': 'kode_billing',
  'TGL BILLING': 'tgl_billing',
  'NTB': 'ntb',
  'NTPN': 'ntpn',
  'STATUS PNBP': 'status_pnbp',
};

const DATE_COLUMNS = new Set(['tanggal_terbit', 'tanggal_permohonan', 'tgl_billing']);
const TIMESTAMP_COLUMNS = new Set(['tgl_tagihan']);
const NUMERIC_COLUMNS = new Set(['biaya_daya', 'tarif_pnbp']);

// Unwrap exceljs cell values: formulas, rich text, hyperlinks.
function cellText(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.result !== undefined) return cellText(value.result);
    if (value.text !== undefined) return String(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    if (value.error !== undefined) return null;
    return String(value);
  }
  return value;
}

// Excel serial day 25569 = 1970-01-01 (1900 date system).
function excelSerialToDate(serial) {
  return new Date(Math.round((serial - 25569) * 86400000));
}

function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return excelSerialToDate(value);

  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;

  throw new Error(`unrecognized date "${s}"`);
}

function toIsoDate(value) {
  const d = parseDateValue(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function toIsoTimestamp(value) {
  const d = parseDateValue(value);
  return d ? d.toISOString() : null;
}

// Handles both "1,234,567.89" and Indonesian "1.234.567,89" styles.
function toNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  let s = String(value).trim().replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1 && s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`unrecognized number "${value}"`);
  return n;
}

function normalizeField(field, raw) {
  if (DATE_COLUMNS.has(field)) return toIsoDate(raw);
  if (TIMESTAMP_COLUMNS.has(field)) return toIsoTimestamp(raw);
  if (NUMERIC_COLUMNS.has(field)) return toNumeric(raw);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

/**
 * Parse an .xlsx buffer into archive_files records.
 * Returns { rows: [{ rowNumber, record }], errors: [{ row, message }] }.
 * Rows with a cell that fails normalization are skipped and reported in errors.
 */
async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (e) {
    const err = new Error('File could not be read as an .xlsx workbook');
    err.status = 400;
    err.code = 'INVALID_FILE';
    throw err;
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    const err = new Error('Workbook contains no worksheets');
    err.status = 400;
    err.code = 'INVALID_FILE';
    throw err;
  }

  const colToField = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const header = String(cellText(cell.value) ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (COLUMN_MAP[header]) colToField[colNumber] = COLUMN_MAP[header];
  });

  if (Object.keys(colToField).length === 0) {
    const err = new Error('No recognized columns found in the header row');
    err.status = 400;
    err.code = 'INVALID_FILE';
    throw err;
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const record = {};
    let hasValue = false;
    try {
      for (const [colNumber, field] of Object.entries(colToField)) {
        const raw = cellText(row.getCell(Number(colNumber)).value);
        let value;
        try {
          value = normalizeField(field, raw);
        } catch (e) {
          throw new Error(`${field}: ${e.message}`);
        }
        if (value !== null) hasValue = true;
        record[field] = value;
      }
      if (hasValue) rows.push({ rowNumber, record });
    } catch (e) {
      errors.push({ row: rowNumber, message: e.message });
    }
  });

  return { rows, errors };
}

module.exports = { parseExcel, COLUMN_MAP };
