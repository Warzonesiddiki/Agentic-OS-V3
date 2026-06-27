import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
const r = await pg.sql`SELECT version()`;
console.log("PG version:", r.rows[0].version);
// Check for vector extension
try {
  await pg.sql`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log("pgvector: available");
} catch(e) {
  console.log("pgvector: NOT available -", e.message);
}
// Create a test table
await pg.sql`CREATE TABLE test1 (id serial primary key, name text)`;
await pg.sql`INSERT INTO test1 (name) VALUES ('hello'), ('world')`;
const r2 = await pg.sql`SELECT * FROM test1`;
console.log("Test query:", r2.rows);
await pg.close();
