# Build prompts — run in order, one per Claude Code session/turn

Put `CLAUDE.md` at the repo root first. Claude Code reads it automatically, so these
prompts stay short — they only state the task, not the schema or conventions.
Start a **new session per phase** if you want max token efficiency (avoids carrying
prior conversation as context); Claude Code will re-read CLAUDE.md and the existing
repo files fresh each time.

After each phase, review the diff, run it, then move to the next prompt. Don't paste
the next prompt until the current phase actually works.

---

## Phase 0 — Repo scaffold

```
Scaffold the repo exactly as described in CLAUDE.md's "Repo layout" section: /backend
and /frontend folders, package.json in each, empty placeholder files for every path
listed. Backend: Express, pg, exceljs, multer, jsonwebtoken, bcrypt, dotenv, cors as
dependencies. Frontend: Vite + React, axios, chart.js, react-router-dom. Add
.env.example to /backend with DATABASE_URL, JWT_SECRET, PORT. Add a root .gitignore
for node_modules and .env. Don't implement any logic yet — just get both apps to
`npm run dev` and show a placeholder page/route.
```

## Phase 1 — Database schema & migrations

```
Implement the database schema from CLAUDE.md exactly as specified (users,
upload_batches, archive_files with the generated tsvector column and indexes). Use
plain SQL migration files under /backend/src/db/migrations, plus a small script
(`npm run migrate`) that runs them against DATABASE_URL using the `pg` client. Enable
the pgcrypto extension for gen_random_uuid(). Add a seed script that creates one test
user (email: test@example.com, password: password123, bcrypt-hashed).
```

## Phase 2 — Auth

```
Implement POST /auth/login per the API contract in CLAUDE.md: verify email/password
against the users table with bcrypt, return a signed JWT (7 day expiry) and the user
object (id, email — never the hash). Implement the auth middleware that verifies the
Bearer token and attaches req.user, used by every other route. Add a basic test (or
curl example in the PR description) proving login works and protected routes 401
without a token.
```

## Phase 3 — Excel upload & parser

```
Implement POST /files/bulk-upload per CLAUDE.md: multer handles the multipart upload
(memory storage, .xlsx only, 10MB limit), excelParser.js reads it with exceljs using
the exact column mapping in CLAUDE.md, normalizes dates to ISO format, and bulk-
inserts into archive_files inside a transaction tied to a new upload_batches row.
Implement the no_agenda duplicate-skip behavior described in CLAUDE.md. Return the
{ batch_id, inserted, skipped_duplicates, errors } summary. Also implement
GET /upload-batches for the sidebar history list.
```

## Phase 4 — Files query, edit, delete

```
Implement queryBuilder.js: takes { search, filters, page, limit } and produces a
parameterized SQL query against archive_files — search hits the tsvector index,
filters is an array of { field, operator, value } (operator: is | contains | is_not)
chained with AND, and results are paginated. Wire this into GET /files. Implement
GET /files/:id (full row), PUT /files/:id (partial update, bump updated_at), and
DELETE /files/:id. Validate that `field` in filters is an allow-listed column name to
prevent SQL injection via field names.
```

## Phase 5 — Stats aggregation

```
Implement GET /stats per CLAUDE.md: accepts dimension (one of area_lit, pjt, tt,
sumber_slo — validate against this allow-list) and an optional filters param using the
same shape and validation as queryBuilder.js from Phase 4 (reuse it). Returns
{ labels, counts } grouped and ordered by count descending.
```

## Phase 6 — Frontend: auth + shell

```
Build the React app shell: Login page posting to /auth/login, storing the JWT (state
+ localStorage), an axios instance in /api/client.js that attaches the token to every
request and redirects to /login on 401, and a protected route wrapper. Add the left
nav with two items, Data and Statistics, routing to /data and /statistics. Match the
visual style already agreed: flat surfaces, minimal borders, sentence case, no
gradients — see the mockups described in this conversation's history for the login
form and sidebar look if available, otherwise keep it clean and simple.
```

## Phase 7 — Frontend: Data page

```
Build the Data page: left sidebar with UploadPanel (drag/drop or click .xlsx,
posts to /files/bulk-upload, shows the returned summary, refreshes the upload
history list from GET /upload-batches) and a total record count. Main area: search
input, FilterBuilder component (add/remove condition rows: field select, operator
select, value input, chained with AND) that both feed into GET /files, a horizontally
scrollable DataTable rendering all 37 columns with a sticky Actions column
(Preview + Edit icons only, no inline Delete), and Pagination. PreviewModal shows all
fields read-only. EditModal is a form for all fields with a Delete button inside it
(confirm before calling DELETE /files/:id).
```

## Phase 8 — Frontend: Statistics page

```
Build the Statistics page: a dimension dropdown (AREA LIT, PJT, TT, SUMBER SLO mapped
to their DB column names), a toggle between "All records" and "Filtered only" (when
filtered, reuse whatever filter state exists from the Data page — lift filter state up
to a shared context or pass via route state), a bar chart and a pie chart (Chart.js)
both driven by GET /stats, with a legend showing percentages under the pie chart.
```

## Phase 9 — Polish pass

```
Do a review pass across the whole app: loading states on every async action, error
toasts/messages on failed requests, empty states (no data yet, no search results),
disable the upload button while an upload is in progress, confirm dialogs on delete,
and basic responsive behavior down to a reasonable minimum width. List anything you
had to guess or simplify due to ambiguity in CLAUDE.md so we can decide together. And also do the live session in localhost so i can see the result.
```
