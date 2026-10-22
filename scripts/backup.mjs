// Gera um backup consistente do banco (VACUUM INTO, compatível com WAL, seguro com a app rodando)
// e uma cópia dos uploads, com manifest.json e retenção configurável.
//
//   npm run backup
//
// Variáveis opcionais:
//   BACKUP_DIR   destino dos backups (padrão: <DATA_DIR>/backups). Recomendado: outro volume/disco.
//   BACKUP_KEEP  quantidade de backups mantidos (padrão: 14).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH, UPLOADS_DIR } from "./lib/paths.mjs";
import { isMain } from "./lib/cli.mjs";

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, "backups"));
const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || "14", 10) || 14);

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function countUploads() {
  if (!fs.existsSync(UPLOADS_DIR)) return 0;
  return fs.readdirSync(UPLOADS_DIR).filter((f) => f.endsWith(".svg")).length;
}

export function createBackup() {
  if (!fs.existsSync(DB_PATH)) throw new Error(`Banco não encontrado: ${DB_PATH}`);

  const target = path.join(BACKUP_DIR, stamp());
  fs.mkdirSync(target, { recursive: true });

  const dbCopy = path.join(target, "epo.sqlite");
  const src = new Database(DB_PATH, { fileMustExist: true });
  try {
    src.prepare("VACUUM INTO ?").run(dbCopy);
    const counts = {
      folders: src.prepare("SELECT COUNT(*) AS n FROM folders").get().n,
      flows: src.prepare("SELECT COUNT(*) AS n FROM flows").get().n,
      users: src.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    };
    const copyCheck = new Database(dbCopy, { readonly: true });
    const check = copyCheck.pragma("integrity_check", { simple: true });
    copyCheck.close();
    if (check !== "ok") throw new Error(`integrity_check do backup falhou: ${check}`);

    if (fs.existsSync(UPLOADS_DIR)) {
      fs.cpSync(UPLOADS_DIR, path.join(target, "uploads"), { recursive: true });
    }

    const manifest = {
      createdAt: new Date().toISOString(),
      database: { file: "epo.sqlite", sha256: sha256File(dbCopy), counts },
      uploads: { count: countUploads(), dir: "uploads" },
    };
    fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { target, manifest };
  } finally {
    src.close();
  }
}

/** Mantém apenas os KEEP backups mais recentes (nomes são timestamps ordenáveis). */
export function applyRetention() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const dirs = fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(BACKUP_DIR, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();
  const removed = [];
  for (const name of dirs.slice(0, Math.max(0, dirs.length - KEEP))) {
    fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

if (isMain(import.meta.url)) {
  try {
    const { target, manifest } = createBackup();
    const removed = applyRetention();
    console.log(`[backup] criado em: ${target}`);
    console.log(`[backup] registros: ${JSON.stringify(manifest.database.counts)}`);
    console.log(`[backup] uploads: ${manifest.uploads.count}`);
    if (removed.length) console.log(`[backup] retenção removeu: ${removed.join(", ")}`);
  } catch (err) {
    console.error(`[backup] erro: ${err.message}`);
    process.exit(1);
  }
}
