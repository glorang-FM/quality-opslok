const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  family: 4, // Force IPv4 — prevents ENETUNREACH on IPv6-only hosts
});

pool.on('error', (err) => console.error('Unexpected PG pool error', err));

const db = {
  async query(text, params = []) {
    const { rows } = await pool.query(text, params);
    return rows;
  },
  async one(text, params = []) {
    const { rows } = await pool.query(text, params);
    return rows[0] || null;
  },
  async run(text, params = []) {
    return pool.query(text, params);
  },
  pool,
};

module.exports = { db, pool };
