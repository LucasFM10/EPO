import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { DATA_DIR, DB_PATH } from "../server/config";

type Db = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __epoDb?: Db; __epoSqlite?: Database.Database };

/**
 * Abre (uma única vez por processo) a conexão SQLite.
 * As migrations NÃO são executadas aqui: rodam no deploy via `npm run db:migrate`.
 */
export function getDb(): Db {
  if (globalForDb.__epoDb) return globalForDb.__epoDb;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  globalForDb.__epoSqlite = sqlite;
  globalForDb.__epoDb = drizzle(sqlite, { schema });
  return globalForDb.__epoDb;
}

export function getSqlite(): Database.Database {
  getDb();
  return globalForDb.__epoSqlite!;
}

export { DATA_DIR };
export * from "./schema";
