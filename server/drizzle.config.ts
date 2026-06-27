import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/nexus";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
