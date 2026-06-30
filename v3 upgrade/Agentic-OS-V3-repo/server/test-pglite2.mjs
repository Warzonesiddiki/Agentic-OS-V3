import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/contrib/vector";

const pg = await PGlite.create({ extensions: { vector } });
const r = await pg.sql`SELECT version()`;
console.log("PG version:", r.rows[0].version);

await pg.sql`CREATE EXTENSION IF NOT EXISTS vector`;
const r2 = await pg.sql`SELECT * FROM pg_extension`;
console.log("Extensions:", r2.rows.map(r=>r.extname));
await pg.sql`CREATE TABLE test_vec (id serial, embedding vector(3))`;
await pg.sql`INSERT INTO test_vec (embedding) VALUES ('[1,2,3]'), ('[4,5,6]')`;
const r3 = await pg.sql`SELECT * FROM test_vec`;
console.log("Vector test:", r3.rows);
await pg.close();
