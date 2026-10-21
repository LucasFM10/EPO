import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { runMigrations } = await import("../scripts/migrate.mjs");
const dbPath = path.join(dataDir, "epo.sqlite");

function open() {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

before(() => runMigrations(dbPath));
after(() => cleanup(dataDir));

test("migrations criam todas as tabelas", () => {
  const db = open();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => (r as { name: string }).name);
  for (const t of ["folders", "flows", "users", "sessions"]) {
    assert.ok(tables.includes(t), `falta a tabela ${t}`);
  }
  db.close();
});

test("migrations são idempotentes e preservam dados existentes", () => {
  const db = open();
  db.prepare("INSERT INTO folders (id, name, parent_id, created_at) VALUES ('f1', 'Pasta', NULL, '2026-01-01')").run();
  db.close();

  runMigrations(dbPath);
  runMigrations(dbPath);

  const check = open();
  const row = check.prepare("SELECT name FROM folders WHERE id = 'f1'").get() as { name: string };
  assert.equal(row.name, "Pasta");
  check.close();
});

test("WAL é habilitado pelo migrador", () => {
  const db = new Database(dbPath);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  db.close();
});

test("foreign keys bloqueiam fluxo sem pasta válida", () => {
  const db = open();
  assert.throws(() =>
    db.prepare("INSERT INTO flows (id, folder_id, title, slug, created_at) VALUES ('x', 'nao-existe', 'T', 't', '2026')").run()
  );
  db.close();
});

test("exclusão de pasta remove subpastas e fluxos (cascade)", () => {
  const db = open();
  db.exec(`
    INSERT INTO folders (id, name, parent_id, created_at) VALUES ('raiz', 'R', NULL, 'x'), ('filha', 'F', 'raiz', 'x');
    INSERT INTO flows (id, folder_id, title, slug, created_at) VALUES ('fl1', 'filha', 'T', 'slug-cascade', 'x');
  `);
  db.prepare("DELETE FROM folders WHERE id = 'raiz'").run();
  const folderCount = (db.prepare("SELECT COUNT(*) AS n FROM folders WHERE id IN ('raiz', 'filha')").get() as { n: number }).n;
  const flowCount = (db.prepare("SELECT COUNT(*) AS n FROM flows WHERE id = 'fl1'").get() as { n: number }).n;
  assert.equal(folderCount, 0);
  assert.equal(flowCount, 0);
  db.close();
});

test("slug de fluxo é único no índice", () => {
  const db = open();
  db.prepare("INSERT INTO folders (id, name, created_at) VALUES ('fz', 'Z', 'x')").run();
  db.prepare("INSERT INTO flows (id, folder_id, title, slug, created_at) VALUES ('u1', 'fz', 'A', 'dup', 'x')").run();
  assert.throws(() =>
    db.prepare("INSERT INTO flows (id, folder_id, title, slug, created_at) VALUES ('u2', 'fz', 'B', 'dup', 'x')").run()
  );
  db.close();
});

test("arquivo do banco fica no caminho configurado", () => {
  assert.ok(fs.existsSync(dbPath));
});
