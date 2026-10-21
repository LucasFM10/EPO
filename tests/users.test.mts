import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { runMigrations } = await import("../scripts/migrate.mjs");
const { createUser, resetPassword } = await import("../scripts/users.mjs");
const { verifyPassword } = await import("../lib/server/password");
const dbPath = path.join(dataDir, "epo.sqlite");

before(() => runMigrations(dbPath));
after(() => cleanup(dataDir));

test("createUser grava e-mail em minúsculas e hash Argon2id", async () => {
  await createUser("Admin@Exemplo.gov.br", "senha-forte-123");
  const db = new Database(dbPath);
  const row = db.prepare("SELECT email, password_hash FROM users").get() as { email: string; password_hash: string };
  db.close();
  assert.equal(row.email, "admin@exemplo.gov.br");
  assert.ok(row.password_hash.startsWith("$argon2id$"));
  assert.equal(row.password_hash.includes("senha-forte-123"), false);
  assert.equal(await verifyPassword(row.password_hash, "senha-forte-123"), true);
});

test("createUser rejeita e-mail duplicado", async () => {
  await assert.rejects(createUser("admin@exemplo.gov.br", "outra-senha-123"), /Já existe/);
});

test("resetPassword troca a senha e encerra as sessões do usuário", async () => {
  const db = new Database(dbPath);
  const user = db.prepare("SELECT id FROM users WHERE email = 'admin@exemplo.gov.br'").get() as { id: string };
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-abc', ?, ?)").run(user.id, Date.now() + 1e6);
  db.close();

  await resetPassword("admin@exemplo.gov.br", "nova-senha-456");

  const check = new Database(dbPath);
  const row = check.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  const sessions = check.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(user.id) as { n: number };
  check.close();
  assert.equal(await verifyPassword(row.password_hash, "nova-senha-456"), true);
  assert.equal(sessions.n, 0);
});

test("resetPassword de usuário inexistente falha", async () => {
  await assert.rejects(resetPassword("ninguem@exemplo.gov.br", "senha-forte-123"), /não encontrado/);
});
