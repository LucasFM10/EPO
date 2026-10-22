// Restaura um backup gerado por scripts/backup.mjs.
//
//   npm run restore -- <pasta-do-backup>
//
// Pare a aplicação antes (docker compose stop app). O estado atual é guardado em
// <DATA_DIR>/pre-restore-<timestamp>/ antes de qualquer substituição.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH, UPLOADS_DIR } from "./lib/paths.mjs";
import { isMain } from "./lib/cli.mjs";

export function restoreBackup(backupDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("manifest.json não encontrado no backup.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const backupDb = path.join(backupDir, manifest.database.file);
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(backupDb)).digest("hex");
  if (actualHash !== manifest.database.sha256) throw new Error("Checksum do banco não confere: backup corrompido.");

  const backupCheck = new Database(backupDb, { readonly: true });
  const check = backupCheck.pragma("integrity_check", { simple: true });
  backupCheck.close();
  if (check !== "ok") throw new Error(`integrity_check falhou: ${check}`);

  const preDir = path.join(DATA_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(preDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const current = DB_PATH + suffix;
    if (fs.existsSync(current)) fs.renameSync(current, path.join(preDir, path.basename(current)));
  }
  if (fs.existsSync(UPLOADS_DIR)) fs.renameSync(UPLOADS_DIR, path.join(preDir, "uploads"));

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.copyFileSync(backupDb, DB_PATH);
  const backupUploads = path.join(backupDir, manifest.uploads.dir);
  if (fs.existsSync(backupUploads)) fs.cpSync(backupUploads, UPLOADS_DIR, { recursive: true });

  return { preDir, manifest };
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Uso: npm run restore -- <pasta-do-backup>");
    process.exit(1);
  }
  try {
    const { preDir, manifest } = restoreBackup(path.resolve(dir));
    console.log(`[restore] concluído a partir de ${manifest.createdAt}`);
    console.log(`[restore] estado anterior guardado em: ${preDir}`);
    console.log("[restore] inicie a aplicação novamente.");
  } catch (err) {
    console.error(`[restore] erro: ${err.message}`);
    process.exit(1);
  }
}
