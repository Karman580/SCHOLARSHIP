import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('DATABASE_URL is not set — using the in-memory store. Nothing to push.');
  process.exit(0);
}

const { default: postgres } = await import('postgres');
const sql = postgres(url, { prepare: false, max: 1 });
await sql.unsafe(readFileSync('lib/db/schema.sql', 'utf8'));
await sql.end();
console.log('Schema applied.');
