import { defineConfig } from "drizzle-kit";

// Usado apenas para gerar novas migrations: `npm run db:generate`.
// A aplicação aplica as migrations com scripts/migrate.mjs (ver README).
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
