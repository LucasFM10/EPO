import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
export const DB_PATH = path.join(DATA_DIR, "epo.sqlite");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
