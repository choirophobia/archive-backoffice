require('dotenv').config();
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const TEST_USERS = [
  { email: 'test@example.com', password: 'password123', role: 'superadmin' },
  { email: 'karyawan@example.com', password: 'password123', role: 'karyawan' },
];

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const u of TEST_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 10);

      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
         RETURNING id, email, role`,
        [u.email, passwordHash, u.role]
      );

      console.log(`Seeded user: ${rows[0].email} (${rows[0].role}) — ${rows[0].id}`);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
