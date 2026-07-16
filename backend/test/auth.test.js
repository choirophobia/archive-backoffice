process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const http = require('node:http');
const express = require('express');

const pool = require('../src/db/pool');
const authRoutes = require('../src/routes/auth');
const requireAuth = require('../src/middleware/auth');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.get('/files', requireAuth, (req, res) => res.json({ user: req.user }));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, { method = 'GET', path, body, token }) {
  const { port } = server.address();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

test('POST /auth/login returns a token and user (no password hash) for valid credentials', async (t) => {
  const passwordHash = await bcrypt.hash('password123', 10);
  const fakeUserRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'superadmin',
  };

  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [fakeUserRow] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const { status, body } = await request(server, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'test@example.com', password: 'password123' },
  });

  assert.equal(status, 200);
  assert.ok(body.token, 'expected a token in the response');
  assert.deepEqual(body.user, { id: fakeUserRow.id, email: fakeUserRow.email, role: 'superadmin' });
  assert.equal(body.user.password_hash, undefined, 'password hash must never be returned');
});

test('POST /auth/login rejects an invalid password with 401', async (t) => {
  const passwordHash = await bcrypt.hash('password123', 10);
  const fakeUserRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'superadmin',
  };

  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [fakeUserRow] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const { status, body } = await request(server, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'test@example.com', password: 'wrong-password' },
  });

  assert.equal(status, 401);
  assert.equal(body.error.code, 'INVALID_CREDENTIALS');
});

test('protected route returns 401 without an Authorization header', async (t) => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const { status, body } = await request(server, { path: '/files' });

  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('protected route returns 401 with an invalid/expired token', async (t) => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const { status, body } = await request(server, { path: '/files', token: 'not-a-real-token' });

  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('PUT /auth/password changes the password when the current password is correct', async (t) => {
  const passwordHash = await bcrypt.hash('password123', 10);
  const fakeUserRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'superadmin',
  };

  let updatedHash = null;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    if (sql.startsWith('SELECT password_hash')) return { rows: [{ password_hash: passwordHash }] };
    if (sql.startsWith('UPDATE users')) {
      updatedHash = params[0];
      return { rows: [] };
    }
    return { rows: [fakeUserRow] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const loginRes = await request(server, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'test@example.com', password: 'password123' },
  });

  const { status, body } = await request(server, {
    method: 'PUT',
    path: '/auth/password',
    token: loginRes.body.token,
    body: { currentPassword: 'password123', newPassword: 'newpassword456' },
  });

  assert.equal(status, 200);
  assert.deepEqual(body, { success: true });
  assert.ok(updatedHash, 'expected password_hash to be updated');
  assert.ok(await bcrypt.compare('newpassword456', updatedHash));
});

test('PUT /auth/password rejects an incorrect current password with 401', async (t) => {
  const passwordHash = await bcrypt.hash('password123', 10);
  const fakeUserRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'superadmin',
  };

  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.startsWith('SELECT password_hash')) return { rows: [{ password_hash: passwordHash }] };
    return { rows: [fakeUserRow] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const loginRes = await request(server, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'test@example.com', password: 'password123' },
  });

  const { status, body } = await request(server, {
    method: 'PUT',
    path: '/auth/password',
    token: loginRes.body.token,
    body: { currentPassword: 'wrong-password', newPassword: 'newpassword456' },
  });

  assert.equal(status, 401);
  assert.equal(body.error.code, 'INVALID_CREDENTIALS');
});

test('PUT /auth/password rejects a new password shorter than 8 characters', async (t) => {
  const passwordHash = await bcrypt.hash('password123', 10);
  const fakeUserRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'superadmin',
  };

  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [fakeUserRow] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const loginRes = await request(server, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'test@example.com', password: 'password123' },
  });

  const { status, body } = await request(server, {
    method: 'PUT',
    path: '/auth/password',
    token: loginRes.body.token,
    body: { currentPassword: 'password123', newPassword: 'short' },
  });

  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test('PUT /auth/password returns 401 without a valid token', async (t) => {
  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const { status, body } = await request(server, {
    method: 'PUT',
    path: '/auth/password',
    body: { currentPassword: 'password123', newPassword: 'newpassword456' },
  });

  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('protected route allows access with a valid token and attaches req.user', async (t) => {
  const passwordHash = await bcrypt.hash('password123', 10);
  const fakeUserRow = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'superadmin',
  };

  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [fakeUserRow] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const app = buildApp();
  const server = await listen(app);
  t.after(() => server.close());

  const loginRes = await request(server, {
    method: 'POST',
    path: '/auth/login',
    body: { email: 'test@example.com', password: 'password123' },
  });

  const { status, body } = await request(server, { path: '/files', token: loginRes.body.token });

  assert.equal(status, 200);
  assert.deepEqual(body.user, { id: fakeUserRow.id, email: fakeUserRow.email, role: 'superadmin' });
});
