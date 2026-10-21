import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { validateSvg } = await import("../lib/server/svg");
const { resolveUpload, fileNameFromUploadUrl, saveSvg, removeUpload } = await import("../lib/server/uploads");
const { hashPassword, verifyPassword } = await import("../lib/server/password");
const rl = await import("../lib/server/rate-limit");
const { UPLOADS_DIR } = await import("../lib/server/config");

after(() => cleanup(dataDir));

const CLEAN_SVG = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>`;

test("SVG limpo é aceito", () => {
  assert.equal(validateSvg(CLEAN_SVG), null);
});

test("SVG com script, handlers, iframe, javascript: ou entidade externa é rejeitado", () => {
  const bad = [
    `<svg><script>alert(1)</script></svg>`,
    `<svg onload="alert(1)"></svg>`,
    `<svg><a href="javascript:alert(1)"><rect/></a></svg>`,
    `<svg><iframe src="x"></iframe></svg>`,
    `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>`,
    `<svg><object data="x"></object></svg>`,
  ];
  for (const svg of bad) assert.notEqual(validateSvg(svg), null, svg);
});

test("arquivo que não é SVG ou está vazio é rejeitado", () => {
  assert.notEqual(validateSvg(""), null);
  assert.notEqual(validateSvg("<html><body>oi</body></html>"), null);
});

test("nome de upload não aceita path traversal nem nomes fora do padrão", () => {
  assert.equal(resolveUpload("../../etc/passwd"), null);
  assert.equal(resolveUpload("..\\..\\x.svg"), null);
  assert.equal(resolveUpload("nao-uuid.svg"), null);
  assert.equal(fileNameFromUploadUrl("/api/uploads/../../segredo"), null);
  assert.equal(fileNameFromUploadUrl("https://exemplo.supabase.co/x.svg"), null);
});

test("upload gravado pelo servidor é localizável e removível", async () => {
  const name = await saveSvg(CLEAN_SVG);
  assert.match(name, /^[0-9a-f-]{36}\.svg$/);
  const full = resolveUpload(name);
  assert.ok(full && fs.existsSync(full));
  assert.equal(path.dirname(full!), path.resolve(UPLOADS_DIR));

  await removeUpload(`/api/uploads/${name}`);
  assert.equal(fs.existsSync(full!), false);
  // Remover arquivo ausente não deve lançar erro.
  await removeUpload(`/api/uploads/${name}`);
});

test("hash de senha é Argon2id e verifica corretamente", async () => {
  const h = await hashPassword("senha-forte-123");
  assert.ok(h.startsWith("$argon2id$"));
  assert.equal(await verifyPassword(h, "senha-forte-123"), true);
  assert.equal(await verifyPassword(h, "senha-errada"), false);
  assert.equal(await verifyPassword("nao-e-um-hash", "qualquer"), false);
});

test("rate limit bloqueia após 5 falhas e libera ao limpar", () => {
  const key = "email:teste@exemplo.gov.br";
  for (let i = 0; i < 4; i++) rl.registerFailure(key);
  assert.equal(rl.isRateLimited(key), false);
  rl.registerFailure(key);
  assert.equal(rl.isRateLimited(key), true);
  rl.clearFailures(key);
  assert.equal(rl.isRateLimited(key), false);
});
