import path from "node:path";

/**
 * Diretório persistente da aplicação (banco SQLite e uploads).
 * Padrão: ./data na raiz do projeto. No Docker é definido como /app/data.
 */
export const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
export const DB_PATH = path.join(DATA_DIR, "epo.sqlite");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

/** Cookies só são marcados como Secure em produção, salvo COOKIE_SECURE=0 (ex.: HTTP local). */
export const COOKIE_SECURE =
  process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_SVG_BYTES = 10 * 1024 * 1024;
export const MAX_BIZAGI_JSON_BYTES = 20 * 1024 * 1024;
