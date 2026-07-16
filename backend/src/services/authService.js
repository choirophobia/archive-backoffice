const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const JWT_EXPIRES_IN = '7d';

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, role FROM users WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function verifyCredentials(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return { id: user.id, email: user.email, role: user.role };
}

function generateToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) return { ok: false, reason: 'NOT_FOUND' };

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return { ok: false, reason: 'INVALID_CURRENT_PASSWORD' };

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
  return { ok: true };
}

module.exports = { findUserByEmail, verifyCredentials, generateToken, changePassword };
