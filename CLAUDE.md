# Permohonan SLO Archive — backoffice

Backoffice web app to archive Excel-based "Permohonan SLO" (PLN) data. Users log in,
bulk-upload `.xlsx` files, and every upload is *appended* to one growing dataset —
never overwritten. Data is browsable in a searchable, filterable, paginated table,
and summarized in a Statistics page with bar/pie charts.

## Tech stack

- Backend: Node.js + Express, PostgreSQL, `exceljs` for parsing, `multer` for upload,
  `jsonwebtoken` + `bcrypt` for auth, `pg` (or Knex) as the DB driver/query builder.
- Frontend: React + Vite, plain fetch/axios, no heavy UI kit required — build simple
  reusable components (Table, Pagination, FilterBuilder, Modal).
- Charts: Chart.js on the frontend for bar/pie.

## Repo layout

```
/backend
  /src
    /routes        auth.js, files.js, uploads.js, stats.js
    /controllers    authController.js, fileController.js, uploadController.js, statsController.js
    /middleware      auth.js (JWT verify), upload.js (multer config)
    /services        excelParser.js, queryBuilder.js, authService.js
    /db              pool.js, migrations/
    server.js
  package.json
/frontend
  /src
    /pages           Login.jsx, Data.jsx, Statistics.jsx
    /components       Sidebar.jsx, DataTable.jsx, Pagination.jsx, FilterBuilder.jsx,
                       UploadPanel.jsx, PreviewModal.jsx, EditModal.jsx, BarChart.jsx, PieChart.jsx
    /api              client.js (axios instance with JWT attached)
    App.jsx
  package.json
CLAUDE.md
```

## Database schema

3 tables. Postgres. Use `uuid` PKs (`gen_random_uuid()`, `pgcrypto` extension).

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'karyawan' CHECK (role IN ('superadmin', 'karyawan')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed', -- pending | completed | failed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE archive_files (
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

CREATE INDEX idx_archive_files_search ON archive_files USING GIN (search_index);
CREATE INDEX idx_archive_files_no_agenda ON archive_files (no_agenda);
CREATE INDEX idx_archive_files_batch ON archive_files (batch_id);
```

Excel column → DB column mapping (fixed schema, exact source header on the left):

```
STATUS PERMOHONAN      -> status_permohonan
NO AGENDA               -> no_agenda
NO AGENDA PLN            -> no_agenda_pln
NIDI BANGSANG            -> nidi_bangsang
NO SERTIFIKAT            -> no_sertifikat
NO REGISTRASI            -> no_registrasi
TANGGAL TERBIT           -> tanggal_terbit
TANGGAL PERMOHONAN       -> tanggal_permohonan
NAMA PEMILIK             -> nama_pemilik
NAMA INSTALASI           -> nama_instalasi
Nama Kelurahan           -> nama_kelurahan
NAMA UP3                 -> nama_up3
NAMA ULP                 -> nama_ulp
Nama Area Layanan        -> nama_area_layanan
Daya                     -> daya
BIAYA DAYA               -> biaya_daya
TARIF PNBP               -> tarif_pnbp
WILAYAH LIT              -> wilayah_lit
AREA LIT                 -> area_lit
PJT                      -> pjt
TT                       -> tt
SUMBER SLO               -> sumber_slo
METODE PEMBAYARAN        -> metode_pembayaran
TELEPON PEMOHON LSP      -> telepon_pemohon_lsp
NAMA AKUN PEMOHON        -> nama_akun_pemohon
TELEPON AKUN PEMOHON     -> telepon_akun_pemohon
EMAIL AKUN PEMOHON       -> email_akun_pemohon
STATUS PENAGIHAN         -> status_penagihan
STATUS PEMBATALAN        -> status_pembatalan
CATATAN PEMBATALAN       -> catatan_pembatalan
NOMOR TAGIHAN            -> nomor_tagihan
TGL TAGIHAN              -> tgl_tagihan
KODE BILLING             -> kode_billing
TGL BILLING              -> tgl_billing
NTB                      -> ntb
NTPN                     -> ntpn
STATUS PNBP              -> status_pnbp
```

**Append behavior**: every upload creates one `upload_batches` row, then bulk-inserts
its rows into `archive_files` tagged with that `batch_id`. Uploads never update or
delete existing rows. Duplicate handling: a row is a duplicate — and gets **skipped**
— if any of `no_agenda`, `no_agenda_pln`, `nidi_bangsang`, `no_sertifikat`, or
`no_registrasi` already has that value elsewhere in `archive_files` or earlier in the
same upload file. Duplicate values in every other column are allowed. Report skips in
the upload summary (`inserted`, `skipped_duplicates`, `errors`) — do not overwrite, do
not insert a duplicate.

## API contract

All routes except `/auth/login` require `Authorization: Bearer <jwt>`. The JWT payload
carries `{ sub, email, role }`; `PUT`/`DELETE /files/:id` additionally require
`role: 'superadmin'` (enforced by `middleware/requireRole.js`) — a `karyawan` token gets
`403 { error: { code: 'FORBIDDEN' } }`. Every other route (list, preview, upload, stats)
is available to both roles.

```
POST   /auth/login                    { email, password } -> { token, user: { id, email, role } }

POST   /files/bulk-upload             multipart form-data, field "file"
                                       -> { batch_id, inserted, skipped_duplicates, errors: [...] }

GET    /files                         query: page, limit, search, filters (JSON-encoded array
                                       of {field, operator, value}, operator in is|contains|is_not)
                                       -> { data: [...], total, page, limit }

GET    /files/:id                     -> full row (all 37 fields) — used by Preview and Edit

PUT    /files/:id                     superadmin only. body: partial row -> updated row

DELETE /files/:id                     superadmin only. -> { success: true }

GET    /stats?dimension=area_lit|pjt|tt|sumber_slo&filters=[...]
                                       -> { labels: [...], counts: [...] }
                                       (filters param optional — omit for "all records" mode,
                                       include for "filtered only" mode, per the frontend toggle)

GET    /upload-batches                -> [{ id, filename, row_count, created_at }, ...]
                                       (for the sidebar upload history list)
```

Response envelope for errors: `{ error: { message, code } }`, standard HTTP status codes.

## Conventions

- All dates from Excel come in as strings or Excel serial numbers — normalize to ISO
  `YYYY-MM-DD` in `excelParser.js` before insert.
- `queryBuilder.js` is the single place that turns `{search, filters}` into a
  parameterized SQL WHERE clause — never string-concatenate raw user input into SQL.
- Frontend never talks to Postgres directly — always through `/api/client.js`.
- Keep controllers thin; business logic (parsing, query building, dedup) lives in
  `/services`.
- Environment variables: `DATABASE_URL`, `JWT_SECRET`, `PORT`. Put an `.env.example`
  in `/backend`.

## Roles

Two roles, set on `users.role`: `superadmin` (full access, including edit/delete) and
`karyawan` (read-only — list, search, filter, preview, upload; the Edit button is hidden
client-side in `DataTable.jsx`, and the API rejects edit/delete attempts server-side
regardless of what the UI shows). New users default to `karyawan`; promote via direct
SQL update (`UPDATE users SET role = 'superadmin' WHERE email = ...`) — no admin UI for
role management in this MVP.

## Out of scope for MVP

- Role management UI (promote/demote happens via direct DB access, see Roles above)
- File storage of the original `.xlsx` (only parsed rows are kept, unless asked later)
- Real-time updates / websockets
