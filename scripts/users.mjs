// Gerenciamento administrativo de usuários. Não existe cadastro público.
//
//   npm run user:create -- admin@exemplo.gov.br
//   npm run user:reset-password -- admin@exemplo.gov.br
//
// A senha é lida do terminal sem eco. Para automação:
//   printf '%s' "$SENHA" | npm run user:create -- admin@exemplo.gov.br --password-stdin
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { hash } from "@node-rs/argon2";
import { DB_PATH } from "./lib/paths.mjs";
import { isMain, readSecret } from "./lib/cli.mjs";
import { runMigrations } from "./migrate.mjs";

// Mesmos parâmetros de lib/server/password.ts (Argon2id, OWASP).
const HASH_OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const MIN_PASSWORD = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function askPassword(usePipe) {
  if (usePipe) return readSecret("");
  const first = await readSecret("Senha: ");
  const second = await readSecret("Confirme a senha: ");
  if (first !== second) throw new Error("As senhas não conferem.");
  return first;
}

function validatePassword(password) {
  if (password.length < MIN_PASSWORD) {
    throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  if (password.length > 1024) throw new Error("A senha é longa demais.");
}

function openDb() {
  runMigrations(); // garante que a tabela users existe
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export async function createUser(rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  const sqlite = openDb();
  try {
    const exists = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) throw new Error("Já existe um usuário com este e-mail. Use user:reset-password.");
    const passwordHash = await hash(password, HASH_OPTIONS);
    sqlite
      .prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), email, passwordHash, new Date().toISOString());
  } finally {
    sqlite.close();
  }
}

export async function resetPassword(rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  const sqlite = openDb();
  try {
    const user = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) throw new Error("Usuário não encontrado.");
    const passwordHash = await hash(password, HASH_OPTIONS);
    // Troca a senha e encerra todas as sessões abertas do usuário.
    sqlite.transaction(() => {
      sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
      sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    })();
  } finally {
    sqlite.close();
  }
}

async function main() {
  const [command, rawEmail, ...flags] = process.argv.slice(2);
  const usage = "Uso: npm run user:create -- <email>  |  npm run user:reset-password -- <email>";
  if (!["create", "reset-password"].includes(command) || !rawEmail) {
    console.error(usage);
    process.exit(1);
  }

  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new Error("E-mail inválido.");
  }

  const password = await askPassword(flags.includes("--password-stdin"));
  validatePassword(password);

  if (command === "create") {
    await createUser(email, password);
    console.log(`Usuário criado: ${email}`);
  } else {
    await resetPassword(email, password);
    console.log(`Senha redefinida e sessões encerradas para: ${email}`);
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
}
