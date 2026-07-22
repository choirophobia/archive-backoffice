// The 37 archive_files data columns, in table order. Labels mirror the source
// Excel headers. `type` drives display formatting and the edit-form input:
// text | number | date | datetime.
export const FIELDS = [
  { key: 'status_permohonan', label: 'Status Permohonan', type: 'text' },
  { key: 'no_agenda', label: 'No Agenda', type: 'text' },
  { key: 'no_agenda_pln', label: 'No Agenda PLN', type: 'text' },
  { key: 'nidi_bangsang', label: 'NIDI Bangsang', type: 'text' },
  { key: 'no_sertifikat', label: 'No Sertifikat', type: 'text' },
  { key: 'no_registrasi', label: 'No Registrasi', type: 'text' },
  { key: 'tanggal_terbit', label: 'Tanggal Terbit', type: 'date' },
  { key: 'tanggal_permohonan', label: 'Tanggal Permohonan', type: 'date' },
  { key: 'nama_pemilik', label: 'Nama Pemilik', type: 'text' },
  { key: 'nama_instalasi', label: 'Nama Instalasi', type: 'text' },
  { key: 'nama_kelurahan', label: 'Nama Kelurahan', type: 'text' },
  { key: 'nama_up3', label: 'Nama UP3', type: 'text' },
  { key: 'nama_ulp', label: 'Nama ULP', type: 'text' },
  { key: 'nama_area_layanan', label: 'Nama Area Layanan', type: 'text' },
  { key: 'daya', label: 'Daya', type: 'text' },
  { key: 'biaya_daya', label: 'Biaya Daya', type: 'number' },
  { key: 'tarif_pnbp', label: 'Tarif PNBP', type: 'number' },
  { key: 'wilayah_lit', label: 'Wilayah LIT', type: 'text' },
  { key: 'area_lit', label: 'Area LIT', type: 'text' },
  { key: 'pjt', label: 'PJT', type: 'text' },
  { key: 'tt', label: 'TT', type: 'text' },
  { key: 'sumber_slo', label: 'Sumber SLO', type: 'text' },
  { key: 'metode_pembayaran', label: 'Metode Pembayaran', type: 'text' },
  { key: 'telepon_pemohon_lsp', label: 'Telepon Pemohon LSP', type: 'text' },
  { key: 'nama_akun_pemohon', label: 'Nama Akun Pemohon', type: 'text' },
  { key: 'telepon_akun_pemohon', label: 'Telepon Akun Pemohon', type: 'text' },
  { key: 'email_akun_pemohon', label: 'Email Akun Pemohon', type: 'text' },
  { key: 'status_penagihan', label: 'Status Penagihan', type: 'text' },
  { key: 'status_pembatalan', label: 'Status Pembatalan', type: 'text' },
  { key: 'catatan_pembatalan', label: 'Catatan Pembatalan', type: 'text' },
  { key: 'nomor_tagihan', label: 'Nomor Tagihan', type: 'text' },
  { key: 'tgl_tagihan', label: 'Tgl Tagihan', type: 'datetime' },
  { key: 'kode_billing', label: 'Kode Billing', type: 'text' },
  { key: 'tgl_billing', label: 'Tgl Billing', type: 'date' },
  { key: 'ntb', label: 'NTB', type: 'text' },
  { key: 'ntpn', label: 'NTPN', type: 'text' },
  { key: 'status_pnbp', label: 'Status PNBP', type: 'text' },
];

// Render a cell/preview value: dates as YYYY-MM-DD, null as ''.
// DATE columns arrive as ISO timestamps at local midnight (pg parses DATE to a
// JS Date), so slicing the UTC string would shift the day in timezones east of
// UTC — use local date components instead.
export function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '';
  if (field.type === 'date' || field.type === 'datetime') {
    const s = String(value);
    if (s.includes('T')) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
    }
    return s.slice(0, 10);
  }
  return String(value);
}

export function apiErrorMessage(err, fallback) {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

// "2025-11" -> "November 2025". Built from local Y/M components (not
// `new Date("2025-11-01")`) so a negative UTC offset can't roll the
// formatted month back a day.
export function formatMonthLabel(label) {
  const [year, month] = String(label).split('-').map(Number);
  if (!year || !month) return label;
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

// PLN/PNBP money columns are Indonesian Rupiah amounts.
export function formatIDR(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}
