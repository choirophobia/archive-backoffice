process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/unused';

const test = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../src/db/pool');
const app = require('../src/app');
const { generateToken } = require('../src/services/authService');
const {
  buildStatsQuery,
  buildCrosstabQuery,
  buildSummaryQuery,
  buildTrendQuery,
} = require('../src/services/queryBuilder');

const TEST_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'test@example.com' };

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, path, { token } = {}) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// --- queryBuilder unit tests ---

test('buildStatsQuery groups by the dimension and orders by count desc', () => {
  const { sql, params } = buildStatsQuery({ dimension: 'area_lit' });

  assert.match(sql, /COALESCE\(area_lit, '\(blank\)'\) AS label/);
  assert.match(sql, /GROUP BY 1/);
  assert.match(sql, /ORDER BY count DESC, label ASC/);
  assert.deepEqual(params, []);
});

test('buildStatsQuery reuses the shared WHERE clause for search and filters', () => {
  const { sql, params } = buildStatsQuery({
    dimension: 'pjt',
    search: 'budi',
    filters: [{ field: 'area_lit', operator: 'is', value: 'JAKARTA' }],
  });

  assert.match(sql, /kode_billing::text ILIKE \$1/);
  assert.match(sql, /area_lit = \$2/);
  assert.deepEqual(params, ['%budi%', 'JAKARTA']);
});

test('buildStatsQuery rejects dimensions outside the allow-list', () => {
  for (const dimension of ['nama_pemilik', 'id; DROP TABLE users--', '', undefined]) {
    assert.throws(
      () => buildStatsQuery({ dimension }),
      (err) => err.status === 400 && err.code === 'INVALID_DIMENSION'
    );
  }
  // filter validation still applies
  assert.throws(
    () => buildStatsQuery({ dimension: 'tt', filters: [{ field: 'evil', operator: 'is', value: 'x' }] }),
    (err) => err.code === 'INVALID_FILTER_FIELD'
  );
});

test('buildTrendQuery buckets by month and excludes null dates', () => {
  const { sql, params } = buildTrendQuery({ dateField: 'tanggal_permohonan' });

  assert.match(sql, /date_trunc\('month', tanggal_permohonan\)/);
  assert.match(sql, /WHERE tanggal_permohonan IS NOT NULL/);
  assert.match(sql, /GROUP BY 1/);
  assert.match(sql, /ORDER BY 1 ASC/);
  assert.deepEqual(params, []);
});

test('buildTrendQuery reuses the shared WHERE clause for search and filters', () => {
  const { sql, params } = buildTrendQuery({
    dateField: 'tanggal_terbit',
    search: 'budi',
    filters: [{ field: 'area_lit', operator: 'is', value: 'JAKARTA' }],
  });

  assert.match(sql, /kode_billing::text ILIKE \$1/);
  assert.match(sql, /area_lit = \$2/);
  assert.match(sql, /AND tanggal_terbit IS NOT NULL/);
  assert.deepEqual(params, ['%budi%', 'JAKARTA']);
});

test('buildTrendQuery rejects date fields outside the allow-list', () => {
  for (const dateField of ['created_at', 'tgl_tagihan', 'id; DROP TABLE users--', '', undefined]) {
    assert.throws(
      () => buildTrendQuery({ dateField }),
      (err) => err.status === 400 && err.code === 'INVALID_DATE_FIELD'
    );
  }
});

test('buildStatsQuery accepts status_permohonan for the KPI breakdown tile', () => {
  const { sql, params } = buildStatsQuery({ dimension: 'status_permohonan' });

  assert.match(sql, /COALESCE\(status_permohonan, '\(blank\)'\) AS label/);
  assert.deepEqual(params, []);
});

test('buildSummaryQuery totals the row count and the two money columns', () => {
  const { sql, params } = buildSummaryQuery({});

  assert.match(sql, /COUNT\(\*\)::int AS total/);
  assert.match(sql, /COALESCE\(SUM\(biaya_daya\), 0\)::float8 AS sum_biaya_daya/);
  assert.match(sql, /COALESCE\(SUM\(tarif_pnbp\), 0\)::float8 AS sum_tarif_pnbp/);
  assert.deepEqual(params, []);
});

test('buildSummaryQuery reuses the shared WHERE clause for search and filters', () => {
  const { sql, params } = buildSummaryQuery({
    search: 'budi',
    filters: [{ field: 'area_lit', operator: 'is', value: 'JAKARTA' }],
  });

  assert.match(sql, /kode_billing::text ILIKE \$1/);
  assert.match(sql, /area_lit = \$2/);
  assert.deepEqual(params, ['%budi%', 'JAKARTA']);
});

test('buildCrosstabQuery groups by both dimensions', () => {
  const { sql, params } = buildCrosstabQuery({ dimension: 'area_lit', secondaryDimension: 'pjt' });

  assert.match(sql, /COALESCE\(area_lit, '\(blank\)'\) AS label/);
  assert.match(sql, /COALESCE\(pjt, '\(blank\)'\) AS group_label/);
  assert.match(sql, /GROUP BY 1, 2/);
  assert.deepEqual(params, []);
});

test('buildCrosstabQuery rejects unknown or matching dimensions', () => {
  assert.throws(
    () => buildCrosstabQuery({ dimension: 'nama_pemilik', secondaryDimension: 'pjt' }),
    (err) => err.status === 400 && err.code === 'INVALID_DIMENSION'
  );
  assert.throws(
    () => buildCrosstabQuery({ dimension: 'area_lit', secondaryDimension: 'nama_pemilik' }),
    (err) => err.status === 400 && err.code === 'INVALID_SECONDARY_DIMENSION'
  );
  assert.throws(
    () => buildCrosstabQuery({ dimension: 'area_lit', secondaryDimension: 'area_lit' }),
    (err) => err.status === 400 && err.code === 'SAME_DIMENSION'
  );
});

test('buildCrosstabQuery reuses the shared WHERE clause for search and filters', () => {
  const { sql, params } = buildCrosstabQuery({
    dimension: 'area_lit',
    secondaryDimension: 'tt',
    search: 'budi',
    filters: [{ field: 'sumber_slo', operator: 'is', value: 'ONLINE' }],
  });

  assert.match(sql, /kode_billing::text ILIKE \$1/);
  assert.match(sql, /sumber_slo = \$2/);
  assert.deepEqual(params, ['%budi%', 'ONLINE']);
});

// --- route tests (mocked pool) ---

test('GET /stats returns { labels, counts } ordered by the query', async (t) => {
  let captured;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    captured = { sql, params };
    return {
      rows: [
        { label: 'JAKARTA', count: 12 },
        { label: 'BANDUNG', count: 5 },
      ],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const filters = encodeURIComponent(
    JSON.stringify([{ field: 'sumber_slo', operator: 'is', value: 'ONLINE' }])
  );
  const { status, body } = await request(server, `/stats?dimension=area_lit&filters=${filters}`, {
    token,
  });

  assert.equal(status, 200);
  assert.deepEqual(body, { labels: ['JAKARTA', 'BANDUNG'], counts: [12, 5] });
  assert.match(captured.sql, /sumber_slo = \$1/);
  assert.deepEqual(captured.params, ['ONLINE']);
});

test('GET /stats rejects a bad dimension or bad filters JSON with 400', async (t) => {
  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const badDimension = await request(server, '/stats?dimension=nama_pemilik', { token });
  assert.equal(badDimension.status, 400);
  assert.equal(badDimension.body.error.code, 'INVALID_DIMENSION');

  const badJson = await request(server, '/stats?dimension=pjt&filters=not-json', { token });
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, 'INVALID_FILTERS');
});

test('GET /stats requires auth', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const { status } = await request(server, '/stats?dimension=area_lit');
  assert.equal(status, 401);
});

test('GET /stats/trend returns { labels, counts } ordered chronologically', async (t) => {
  let captured;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    captured = { sql, params };
    return {
      rows: [
        { label: '2025-01', count: 4 },
        { label: '2025-02', count: 9 },
      ],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const { status, body } = await request(server, '/stats/trend?dateField=tanggal_permohonan', {
    token,
  });

  assert.equal(status, 200);
  assert.deepEqual(body, { labels: ['2025-01', '2025-02'], counts: [4, 9] });
  assert.match(captured.sql, /date_trunc\('month', tanggal_permohonan\)/);
});

test('GET /stats/trend rejects a bad dateField with 400', async (t) => {
  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const { status, body } = await request(server, '/stats/trend?dateField=created_at', { token });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_DATE_FIELD');
});

test('GET /stats/trend requires auth', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const { status } = await request(server, '/stats/trend?dateField=tanggal_permohonan');
  assert.equal(status, 401);
});

test('GET /stats/summary returns { total, sumBiayaDaya, sumTarifPnbp }', async (t) => {
  let captured;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ total: 2098, sum_biaya_daya: 123456.5, sum_tarif_pnbp: 7890 }] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const { status, body } = await request(server, '/stats/summary', { token });

  assert.equal(status, 200);
  assert.deepEqual(body, { total: 2098, sumBiayaDaya: 123456.5, sumTarifPnbp: 7890 });
  assert.match(captured.sql, /COUNT\(\*\)::int AS total/);
});

test('GET /stats/summary requires auth', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const { status } = await request(server, '/stats/summary');
  assert.equal(status, 401);
});

test('GET /stats/crosstab returns flat { label, groupLabel, count } rows', async (t) => {
  let captured;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    captured = { sql, params };
    return {
      rows: [
        { label: 'JAKARTA', group_label: 'Cetak SLO', count: 40 },
        { label: 'JAKARTA', group_label: 'PROSES', count: 3 },
      ],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const server = await listen();
  t.after(() => server.close());

  const token = generateToken(TEST_USER);
  const { status, body } = await request(
    server,
    '/stats/crosstab?dimension=area_lit&secondaryDimension=status_permohonan',
    { token }
  );

  assert.equal(status, 200);
  assert.deepEqual(body, {
    rows: [
      { label: 'JAKARTA', groupLabel: 'Cetak SLO', count: 40 },
      { label: 'JAKARTA', groupLabel: 'PROSES', count: 3 },
    ],
  });
  assert.match(captured.sql, /GROUP BY 1, 2/);
});

test('GET /stats/crosstab rejects a bad secondaryDimension or matching dimensions with 400', async (t) => {
  const server = await listen();
  t.after(() => server.close());
  const token = generateToken(TEST_USER);

  const badSecondary = await request(
    server,
    '/stats/crosstab?dimension=area_lit&secondaryDimension=nama_pemilik',
    { token }
  );
  assert.equal(badSecondary.status, 400);
  assert.equal(badSecondary.body.error.code, 'INVALID_SECONDARY_DIMENSION');

  const sameDimension = await request(
    server,
    '/stats/crosstab?dimension=area_lit&secondaryDimension=area_lit',
    { token }
  );
  assert.equal(sameDimension.status, 400);
  assert.equal(sameDimension.body.error.code, 'SAME_DIMENSION');
});

test('GET /stats/crosstab requires auth', async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const { status } = await request(server, '/stats/crosstab?dimension=area_lit&secondaryDimension=pjt');
  assert.equal(status, 401);
});
