import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { runMigrations } = await import("../scripts/migrate.mjs");
const { DB_PATH, UPLOADS_DIR } = await import("../lib/server/config");
const repo = await import("../lib/server/repo");
const uploads = await import("../lib/server/uploads");

before(() => runMigrations(DB_PATH));
after(() => cleanup(dataDir));

const SVG_NAME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg";
const PDF_NAME = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf";

test("nome de pasta repetido no mesmo nível é detectado, sem diferenciar maiúsculas", () => {
  const parent = repo.insertFolder("Raiz Teste", null);
  repo.insertFolder("Financeiro", parent);
  assert.equal(repo.folderNameTaken(parent, "financeiro"), true);
  assert.equal(repo.folderNameTaken(parent, "  FINANCEIRO  "), true);
  assert.equal(repo.folderNameTaken(parent, "Jurídico"), false);
  // Mesmo nome em outro nível é permitido.
  assert.equal(repo.folderNameTaken(null, "Financeiro"), false);
});

test("título de fluxo repetido na mesma pasta é detectado; em outra pasta é permitido", () => {
  const folderA = repo.insertFolder("Pasta A", null);
  const folderB = repo.insertFolder("Pasta B", null);
  const flowId = repo.insertFlow({ folderId: folderA, title: "Citação" });
  assert.equal(repo.flowTitleTaken(folderA, "citação"), true);
  assert.equal(repo.flowTitleTaken(folderB, "Citação"), false);
  // Renomear o próprio fluxo para o mesmo nome não conta como conflito.
  assert.equal(repo.flowTitleTaken(folderA, "Citação", flowId), false);
});

test("fluxo pode ser criado vazio, sem SVG, PDF nem Bizagi", () => {
  const folder = repo.insertFolder("Vazia", null);
  const id = repo.insertFlow({ folderId: folder, title: "Fluxo vazio" });
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT svg_url, pdf_url, bizagi_data FROM flows WHERE id = ?").get(id);
  db.close();
  assert.deepEqual(row, { svg_url: null, pdf_url: null, bizagi_data: null });
});

test("trocar ou remover o SVG remove o Bizagi, mas não o PDF", () => {
  const folder = repo.insertFolder("Regras", null);
  const id = repo.insertFlow({
    folderId: folder,
    title: "Com tudo",
    svgUrl: `/api/uploads/${SVG_NAME}`,
    pdfUrl: `/api/uploads/${PDF_NAME}`,
    bizagiData: { pages: [{ name: "P" }] },
  });

  const obsolete = repo.updateFlowFiles(id, { svgUrl: null });
  assert.deepEqual(obsolete, [`/api/uploads/${SVG_NAME}`]);

  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT svg_url, pdf_url, bizagi_data FROM flows WHERE id = ?").get(id) as Record<string, unknown>;
  db.close();
  assert.equal(row.svg_url, null);
  assert.equal(row.bizagi_data, null, "Bizagi removido junto com o SVG");
  assert.equal(row.pdf_url, `/api/uploads/${PDF_NAME}`, "PDF preservado");
});

test("anexar Bizagi com SVG novo substitui o SVG anterior e devolve a URL antiga para remoção", () => {
  const folder = repo.insertFolder("Substituição", null);
  const oldSvg = "/api/uploads/cccccccc-cccc-4ccc-8ccc-cccccccccccc.svg";
  const id = repo.insertFlow({ folderId: folder, title: "Troca", svgUrl: oldSvg });
  const newSvg = "/api/uploads/dddddddd-dddd-4ddd-8ddd-dddddddddddd.svg";
  const obsolete = repo.updateFlowFiles(id, { svgUrl: newSvg, bizagiData: { pages: [] } });
  assert.deepEqual(obsolete, [oldSvg]);

  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT svg_url, bizagi_data FROM flows WHERE id = ?").get(id) as { svg_url: string; bizagi_data: string };
  db.close();
  assert.equal(row.svg_url, newSvg);
  assert.deepEqual(JSON.parse(row.bizagi_data), { pages: [] });
});

test("apenas nomes no padrão UUID com .svg ou .pdf são aceitos como arquivos", () => {
  assert.ok(uploads.resolveUpload(SVG_NAME));
  assert.ok(uploads.resolveUpload(PDF_NAME));
  assert.equal(uploads.resolveUpload("../../etc/passwd"), null);
  assert.equal(uploads.resolveUpload("arquivo.pdf"), null);
  assert.equal(uploads.resolveUpload(`${SVG_NAME}.exe`), null);
  assert.equal(uploads.fileNameFromUploadUrl(`/api/uploads/${PDF_NAME}`), PDF_NAME);
});

test("validação de PDF: exige cabeçalho %PDF- e limite de tamanho", () => {
  assert.equal(uploads.validatePdf(Buffer.from("%PDF-1.7\n...")), null);
  assert.match(uploads.validatePdf(Buffer.from("<html>")) ?? "", /PDF válido/);
  assert.match(uploads.validatePdf(Buffer.alloc(0)) ?? "", /vazio/);
});

test("savePdf grava o arquivo com nome gerado pelo servidor e removeUpload apaga", async () => {
  const name = await uploads.savePdf(Buffer.from("%PDF-1.4 teste"));
  assert.match(name, /^[0-9a-f-]{36}\.pdf$/);
  const full = path.join(UPLOADS_DIR, name);
  assert.equal(fs.readFileSync(full, "utf8"), "%PDF-1.4 teste");
  await uploads.removeUpload(uploads.uploadUrl(name));
  assert.equal(fs.existsSync(full), false);
});

test("backup v2 leva o PDF de ida e volta (export -> import)", async () => {
  const backup = await import("../lib/server/backup-export");
  const importer = await import("../lib/server/backup-import");
  const folder = repo.insertFolder("Backup PDF", null);
  const flowId = repo.insertFlow({ folderId: folder, title: "Com PDF" });
  const pdfData = Buffer.from("%PDF-1.4 conteudo de teste");
  const pdfName = await uploads.savePdf(pdfData);
  repo.updateFlowFiles(flowId, { pdfUrl: uploads.uploadUrl(pdfName) });

  const { buffer } = await backup.buildExportZip();
  const report = await importer.importExportZip(buffer);
  assert.equal(report.pdfs.written, 1);
  assert.deepEqual(report.pdfs.invalid, []);

  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT pdf_url FROM flows WHERE id = ?").get(flowId) as { pdf_url: string | null };
  db.close();
  assert.ok(row.pdf_url, "fluxo continua com PDF após a substituição");
  assert.equal(fs.readFileSync(path.join(UPLOADS_DIR, path.basename(row.pdf_url)), "utf8"), "%PDF-1.4 conteudo de teste");
});
