import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { runMigrations } = await import("../scripts/migrate.mjs");
const { DB_PATH, UPLOADS_DIR } = await import("../lib/server/config");
const { createBackup, applyRetention } = await import("../scripts/backup.mjs");
const { restoreBackup } = await import("../scripts/restore.mjs");

before(() => {
  runMigrations(DB_PATH);
  const db = new Database(DB_PATH);
  db.prepare("INSERT INTO folders (id, name, created_at) VALUES ('f1', 'Original', 'x')").run();
  db.close();
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, "a.svg"), "<svg/>");
});
after(() => cleanup(dataDir));

test("backup consistente, com manifest e uploads", () => {
  const { target, manifest } = createBackup();
  assert.equal(manifest.database.counts.folders, 1);
  assert.equal(manifest.uploads.count, 1);
  assert.ok(fs.existsSync(path.join(target, "epo.sqlite")));
  assert.ok(fs.existsSync(path.join(target, "uploads", "a.svg")));
});

test("restore recupera o estado do backup e guarda o estado anterior", () => {
  const backups = fs.readdirSync(path.join(dataDir, "backups")).sort();
  const backupDir = path.join(dataDir, "backups", backups[0]);

  const db = new Database(DB_PATH);
  db.prepare("DELETE FROM folders").run();
  db.close();

  const { preDir } = restoreBackup(backupDir);
  const check = new Database(DB_PATH);
  const n = (check.prepare("SELECT COUNT(*) AS n FROM folders").get() as { n: number }).n;
  check.close();
  assert.equal(n, 1);
  assert.ok(fs.existsSync(preDir));
});

test("restore rejeita backup com checksum divergente", () => {
  const { target } = createBackup();
  fs.appendFileSync(path.join(target, "epo.sqlite"), "corrompido");
  assert.throws(() => restoreBackup(target), /Checksum/);
});

test("retenção mantém no máximo 14 backups", () => {
  const base = path.join(dataDir, "backups");
  for (let i = 0; i < 16; i++) {
    const d = path.join(base, `2000-01-${String(i + 1).padStart(2, "0")}T00-00-00-000Z`);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "manifest.json"), "{}");
  }
  const removed = applyRetention();
  assert.ok(removed.length > 0);
  const left = fs.readdirSync(base).filter((n) => fs.existsSync(path.join(base, n, "manifest.json")));
  assert.ok(left.length <= 14, `restaram ${left.length}`);
});
