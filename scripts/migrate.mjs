// Aplica as migrations versionadas do Drizzle. Seguro para rodar repetidamente:
// migrations já aplicadas são registradas em __drizzle_migrations e ignoradas.
// Uso: npm run db:migrate
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { DATA_DIR, DB_PATH, MIGRATIONS_DIR } from "./lib/paths.mjs";
import { isMain } from "./lib/cli.mjs";

export function runMigrations(dbPath = DB_PATH) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("journal_mode = WAL");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const applied = sqlite.prepare('SELECT COUNT(*) AS n FROM "__drizzle_migrations"').get().n;
    return applied;
  } finally {
    sqlite.close();
  }
}

// Executa diretamente quando chamado como script.
if (isMain(import.meta.url)) {
  try {
    const count = runMigrations();
    console.log(`[migrate] banco: ${DB_PATH}`);
    console.log(`[migrate] migrations registradas: ${count}`);
  } catch (err) {
    console.error("[migrate] falha ao aplicar migrations:", err.message);
    process.exit(1);
  }
}
