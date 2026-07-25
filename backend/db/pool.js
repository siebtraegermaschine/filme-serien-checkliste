import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : 10,
});

pool.on('error', (err) => {
  console.error('Unerwarteter Fehler auf einem idle Postgres-Client', err);
});
