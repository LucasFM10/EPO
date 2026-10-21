import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import Database from "better-sqlite3";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { runMigrations } = await import("../scripts/migrate.mjs");
const { DB_PATH, UPLOADS_DIR } = await import("../lib/server/config");
const { importExportZip, ImportError } = await import("../lib/server/backup-import");

const OK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>`;
const BAD_SVG = `<svg><script>alert(1)</script></svg>`;

const ROOT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const FLOW = "33333333-3333-4333-8333-333333333333";
const FLOW_BAD = "44444444-4444-4444-8444-444444444444";

/** Monta um .zip no mesmo formato gerado por lib/export.ts (branch main). */
async function buildExport(overrides: { flows?: unknown[]; folders?: unknown[]; manifest?: unknown; files?: Record<string, string> } = {}) {
  const zip = new JSZip();
  const folders = overrides.folders ?? [
    { id: ROOT, name: "Raiz", parent_id: null, created_at: "2025-01-01T00:00:00Z" },
    { id: CHILD, name: "Filha", parent_id: ROOT, created_at: "2025-01-02T00:00:00Z" },
  ];
  const flows = overrides.flows ?? [
    { id: FLOW, folder_id: CHILD, title: "Processo A", slug: "processo-a", svg: `svg/${FLOW}.svg`, bizagi_data: { pages: [{ name: "A" }] }, created_at: "2025-02-01T00:00:00Z" },
    { id: FLOW_BAD, folder_id: ROOT, title: "Processo ruim", slug: "processo-ruim", svg: `svg/${FLOW_BAD}.svg`, bizagi_data: null, created_at: "2025-02-02T00:00:00Z" },
  ];
  const manifest = overrides.manifest ?? { format: "epo-export", version: 1, exportedAt: "2026-01-01T00:00:00Z", folders, flows };
  zip.file("epo-export.json", typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  zip.file(`svg/${FLOW}.svg`, OK_SVG);
  zip.file(`svg/${FLOW_BAD}.svg`, BAD_SVG);
  for (const [name, content] of Object.entries(overrides.files ?? {})) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

function open() {
  const db = new Database(DB_PATH, { readonly: true });
  return db;
}

before(() => runMigrations(DB_PATH));
after(() => cleanup(dataDir));

test("importa pastas, fluxos e SVGs com os mesmos ids", async () => {
  const report = await importExportZip(await buildExport());
  assert.equal(report.folders.inserted, 2);
  assert.equal(report.flows.inserted, 2);
  assert.equal(report.svgs.written, 1);
  assert.equal(report.svgs.invalid.length, 1, "SVG com script deve ser recusado");

  const db = open();
  const child = db.prepare("SELECT parent_id FROM folders WHERE id = ?").get(CHILD) as { parent_id: string };
  assert.equal(child.parent_id, ROOT, "hierarquia preservada");
  const flow = db.prepare("SELECT title, slug, svg_url, bizagi_data FROM flows WHERE id = ?").get(FLOW) as {
    title: string; slug: string; svg_url: string; bizagi_data: string;
  };
  assert.equal(flow.title, "Processo A");
  assert.equal(flow.slug, "processo-a");
  assert.deepEqual(JSON.parse(flow.bizagi_data), { pages: [{ name: "A" }] });
  assert.match(flow.svg_url, /^\/api\/uploads\/[0-9a-f-]{36}\.svg$/);
  const bad = db.prepare("SELECT svg_url FROM flows WHERE id = ?").get(FLOW_BAD) as { svg_url: string | null };
  assert.equal(bad.svg_url, null);
  db.close();

  const file = path.join(UPLOADS_DIR, path.basename((open().prepare("SELECT svg_url FROM flows WHERE id = ?").get(FLOW) as { svg_url: string }).svg_url));
  assert.equal(fs.readFileSync(file, "utf8"), OK_SVG);
});

test("importar o mesmo arquivo de novo não duplica nem grava SVG órfão", async () => {
  const before = fs.readdirSync(UPLOADS_DIR).length;
  const report = await importExportZip(await buildExport());
  assert.equal(report.folders.inserted, 0);
  assert.equal(report.flows.inserted, 0);
  assert.equal(report.folders.skipped, 2);
  assert.equal(report.flows.skipped, 2);
  assert.equal(report.svgs.written, 0);
  assert.equal(fs.readdirSync(UPLOADS_DIR).length, before);
});

test("slug em conflito recebe sufixo, sem colidir", async () => {
  const other = "55555555-5555-4555-8555-555555555555";
  const report = await importExportZip(
    await buildExport({
      folders: [{ id: ROOT, name: "Raiz", parent_id: null }],
      flows: [{ id: other, folder_id: ROOT, title: "Processo A", slug: "processo-a", svg: null, bizagi_data: null }],
      files: {},
    })
  );
  assert.equal(report.flows.inserted, 1);
  const db = open();
  const row = db.prepare("SELECT slug FROM flows WHERE id = ?").get(other) as { slug: string };
  db.close();
  assert.notEqual(row.slug, "processo-a");
  assert.ok(row.slug.startsWith("processo-a-"));
});

test("arquivo que não é zip é recusado", async () => {
  await assert.rejects(importExportZip(Buffer.from("isto não é um zip")), ImportError);
});

test("zip sem epo-export.json é recusado", async () => {
  const zip = new JSZip();
  zip.file("outro.txt", "x");
  await assert.rejects(importExportZip(await zip.generateAsync({ type: "nodebuffer" })), /epo-export\.json/);
});

test("formato ou versão desconhecidos são recusados", async () => {
  await assert.rejects(
    importExportZip(await buildExport({ manifest: { format: "outro", version: 1, folders: [], flows: [] } })),
    /Formato desconhecido/
  );
  await assert.rejects(
    importExportZip(await buildExport({ manifest: { format: "epo-export", version: 99, folders: [], flows: [] } })),
    /Versão/
  );
});

test("caminho de SVG fora do padrão é recusado (sem path traversal)", async () => {
  const id = "66666666-6666-4666-8666-666666666666";
  await assert.rejects(
    importExportZip(
      await buildExport({
        folders: [{ id: ROOT, name: "Raiz", parent_id: null }],
        flows: [{ id, folder_id: ROOT, title: "X", slug: "x", svg: "../../etc/passwd", bizagi_data: null }],
      })
    ),
    /Caminho de SVG/
  );
});

test("id com caracteres inválidos é recusado", async () => {
  await assert.rejects(
    importExportZip(await buildExport({ folders: [{ id: "../x", name: "Raiz", parent_id: null }], flows: [] })),
    /ID de pasta inválido/
  );
});

test("fluxo apontando para pasta inexistente é ignorado com aviso", async () => {
  const id = "77777777-7777-4777-8777-777777777777";
  const report = await importExportZip(
    await buildExport({
      folders: [{ id: ROOT, name: "Raiz", parent_id: null }],
      flows: [{ id, folder_id: "99999999-9999-4999-8999-999999999999", title: "Órfão", slug: "orfao", svg: null, bizagi_data: null }],
    })
  );
  assert.equal(report.flows.inserted, 0);
  assert.ok(report.issues.some((i) => i.includes("pasta inexistente")));
});

test("ids duplicados no arquivo são recusados", async () => {
  await assert.rejects(
    importExportZip(
      await buildExport({
        folders: [
          { id: ROOT, name: "A", parent_id: null },
          { id: ROOT, name: "B", parent_id: null },
        ],
        flows: [],
      })
    ),
    /ID duplicado/
  );
});

test("JSON malformado é recusado", async () => {
  await assert.rejects(importExportZip(await buildExport({ manifest: "{ isto não é json" })), /JSON válido/);
});
