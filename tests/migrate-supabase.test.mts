import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { useTempDataDir, cleanup } from "./helpers.mts";

// Servidor falso que imita o PostgREST do Supabase e o Storage público.
const OK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>`;
const BAD_SVG = `<svg><script>alert(1)</script></svg>`;

const FOLDERS = [
  { id: "00000000-0000-4000-8000-000000000002", name: "Filha", parent_id: "00000000-0000-4000-8000-000000000001", created_at: "2025-01-02T00:00:00Z" },
  { id: "00000000-0000-4000-8000-000000000001", name: "Raiz", parent_id: null, created_at: "2025-01-01T00:00:00Z" },
];
const FLOWS = [
  { id: "00000000-0000-4000-8000-0000000000a1", folder_id: "00000000-0000-4000-8000-000000000002", title: "Com SVG", slug: "com-svg", svg_url: "__BASE__/storage/ok.svg", bizagi_data: { pages: [{ name: "P" }] }, created_at: "2025-02-01T00:00:00Z" },
  { id: "00000000-0000-4000-8000-0000000000a2", folder_id: "00000000-0000-4000-8000-000000000001", title: "SVG perigoso", slug: "svg-perigoso", svg_url: "__BASE__/storage/bad.svg", bizagi_data: null, created_at: "2025-02-02T00:00:00Z" },
  { id: "00000000-0000-4000-8000-0000000000a3", folder_id: "00000000-0000-4000-8000-000000000001", title: "SVG ausente", slug: "svg-ausente", svg_url: "__BASE__/storage/missing.svg", bizagi_data: { x: 1 }, created_at: "2025-02-03T00:00:00Z" },
];

let server: http.Server;
let base = "";
let dataDir = "";
let runSupabaseMigration: (opts?: { dryRun?: boolean }) => Promise<void>;

before(async () => {
  dataDir = useTempDataDir();
  server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    // Só o REST exige a chave; o Storage do caso real é público.
    if (url.pathname.startsWith("/rest/") && req.headers.apikey !== "chave-teste") {
      res.writeHead(401).end();
      return;
    }
    if (url.pathname === "/rest/v1/folders") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(FOLDERS));
    if (url.pathname === "/rest/v1/flows") {
      const body = FLOWS.map((f) => ({ ...f, svg_url: f.svg_url?.replace("__BASE__", base) ?? null }));
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    }
    if (url.pathname === "/storage/ok.svg") return res.writeHead(200, { "content-type": "image/svg+xml" }).end(OK_SVG);
    if (url.pathname === "/storage/bad.svg") return res.writeHead(200, { "content-type": "image/svg+xml" }).end(BAD_SVG);
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_ANON_KEY = "chave-teste";

  ({ runSupabaseMigration } = await import("../scripts/migrate-from-supabase.mts"));
});

after(() => {
  server?.close();
  cleanup(dataDir);
});

function openTarget() {
  const db = new Database(path.join(dataDir, "epo.sqlite"));
  db.pragma("foreign_keys = ON");
  return db;
}

test("dry-run não grava nada no banco nem em uploads", async () => {
  await runSupabaseMigration({ dryRun: true });
  const db = openTarget();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM folders").get() as { n: number }).n;
  db.close();
  assert.equal(n, 0);
  assert.equal(fs.existsSync(path.join(dataDir, "uploads")), false);
});

test("migração real preserva ids, hierarquia e JSON do Bizagi", async () => {
  await runSupabaseMigration({ dryRun: false });
  const db = openTarget();

  const folders = db.prepare("SELECT id, parent_id FROM folders ORDER BY id").all() as { id: string; parent_id: string | null }[];
  assert.equal(folders.length, 2);
  const child = folders.find((f) => f.id === FOLDERS[0].id);
  assert.equal(child?.parent_id, FOLDERS[1].id);

  const flow = db.prepare("SELECT bizagi_data FROM flows WHERE id = ?").get(FLOWS[0].id) as { bizagi_data: string };
  assert.deepEqual(JSON.parse(flow.bizagi_data), FLOWS[0].bizagi_data);
  db.close();
});

test("SVG válido é baixado e referenciado pelo caminho local", async () => {
  const db = openTarget();
  const row = db.prepare("SELECT svg_url FROM flows WHERE id = ?").get(FLOWS[0].id) as { svg_url: string };
  db.close();
  assert.match(row.svg_url, /^\/api\/uploads\/[0-9a-f-]{36}\.svg$/);
  const file = path.join(dataDir, "uploads", path.basename(row.svg_url));
  assert.equal(fs.readFileSync(file, "utf8"), OK_SVG);
});

test("SVG perigoso e SVG ausente não são gravados e aparecem no relatório", async () => {
  const db = openTarget();
  const rows = db
    .prepare("SELECT id, svg_url FROM flows WHERE id IN (?, ?)")
    .all(FLOWS[1].id, FLOWS[2].id) as { id: string; svg_url: string | null }[];
  db.close();
  assert.ok(rows.every((r) => r.svg_url === null));

  const reports = fs.readdirSync(dataDir).filter((f) => f.startsWith("migration-report-"));
  const latest = JSON.parse(fs.readFileSync(path.join(dataDir, reports.sort().at(-1)!), "utf8"));
  assert.equal(latest.svg.failed.length, 2);
  assert.equal(latest.validation.countsMatch, true);
  assert.equal(latest.validation.foreignKeyViolations, 0);
});

test("executar de novo é idempotente (não duplica registros)", async () => {
  await runSupabaseMigration({ dryRun: false });
  const db = openTarget();
  const f = (db.prepare("SELECT COUNT(*) AS n FROM folders").get() as { n: number }).n;
  const fl = (db.prepare("SELECT COUNT(*) AS n FROM flows").get() as { n: number }).n;
  db.close();
  assert.equal(f, 2);
  assert.equal(fl, 3);
  // Só o SVG válido foi gravado; re-execução não gera arquivos órfãos.
  assert.equal(fs.readdirSync(path.join(dataDir, "uploads")).length, 1);
});
