CREATE TABLE IF NOT EXISTS archive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES upload_batches(id) ON DELETE CASCADE,

  status_permohonan TEXT,
  no_agenda TEXT,              -- natural unique-ish key from source system
  no_agenda_pln TEXT,
  nidi_bangsang TEXT,
  no_sertifikat TEXT,
  no_registrasi TEXT,
  tanggal_terbit DATE,
  tanggal_permohonan DATE,
  nama_pemilik TEXT,
  nama_instalasi TEXT,
  nama_kelurahan TEXT,
  nama_up3 TEXT,
  nama_ulp TEXT,
  nama_area_layanan TEXT,
  daya TEXT,
  biaya_daya NUMERIC,
  tarif_pnbp NUMERIC,
  wilayah_lit TEXT,
  area_lit TEXT,                -- chart dimension
  pjt TEXT,                     -- chart dimension
  tt TEXT,                      -- chart dimension
  sumber_slo TEXT,              -- chart dimension
  metode_pembayaran TEXT,
  telepon_pemohon_lsp TEXT,
  nama_akun_pemohon TEXT,
  telepon_akun_pemohon TEXT,
  email_akun_pemohon TEXT,
  status_penagihan TEXT,
  status_pembatalan TEXT,
  catatan_pembatalan TEXT,
  nomor_tagihan TEXT,
  tgl_tagihan TIMESTAMPTZ,
  kode_billing TEXT,
  tgl_billing DATE,
  ntb TEXT,
  ntpn TEXT,
  status_pnbp TEXT,

  search_index TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(status_permohonan,'') || ' ' || coalesce(no_agenda,'') || ' ' ||
      coalesce(no_sertifikat,'') || ' ' || coalesce(nama_pemilik,'') || ' ' || coalesce(nama_instalasi,'') || ' ' ||
      coalesce(nama_ulp,'') || ' ' || coalesce(nama_up3,'') || ' ' || coalesce(email_akun_pemohon,'') || ' ' ||
      coalesce(nama_akun_pemohon,'') || ' ' || coalesce(nomor_tagihan,''))
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_files_search ON archive_files USING GIN (search_index);
CREATE INDEX IF NOT EXISTS idx_archive_files_no_agenda ON archive_files (no_agenda);
CREATE INDEX IF NOT EXISTS idx_archive_files_batch ON archive_files (batch_id);
