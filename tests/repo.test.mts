import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { eq } from "drizzle-orm";
import { useTempDataDir, cleanup } from "./helpers.mts";

const dataDir = useTempDataDir();
const { runMigrations } = await import("../scripts/migrate.mjs");
const { DB_PATH } = await import("../lib/server/config");
const repo = await import("../lib/server/repo");
const { getDb, getSqlite, folders, flows } = await import("../lib/db");

before(() => runMigrations(DB_PATH));
after(() => {
  getSqlite().close();
  cleanup(dataDir);
});

function parentOf(id: string): string | null | undefined {
  return getDb().select().from(folders).where(eq(folders.id, id)).get()?.parent_id;
}

test("moveFolderRow bloqueia mover para si mesma", () => {
  const a = repo.insertFolder("A", null);
  assert.throws(() => repo.moveFolderRow(a, a), /dela mesma/);
});

test("moveFolderRow bloqueia mover para uma subpasta (evita ciclo e órfãos)", () => {
  const a = repo.insertFolder("A2", null);
  const b = repo.insertFolder("B2", a);
  const c = repo.insertFolder("C2", b);
  assert.throws(() => repo.moveFolderRow(a, c), /subpastas/);
  assert.throws(() => repo.moveFolderRow(a, b), /subpastas/);
  assert.equal(parentOf(a), null, "a pasta não deve ter sido alterada");
});

test("moveFolderRow aceita mover entre árvores e para a raiz", () => {
  const x = repo.insertFolder("X", null);
  const y = repo.insertFolder("Y", null);
  repo.moveFolderRow(y, x);
  assert.equal(parentOf(y), x);
  repo.moveFolderRow(y, null);
  assert.equal(parentOf(y), null);
});

test("moveFolderRow rejeita destino inexistente", () => {
  const z = repo.insertFolder("Z", null);
  assert.throws(() => repo.moveFolderRow(z, "nao-existe"), /não encontrada/);
});

test("deleteFolderTree retorna SVGs da subárvore e apaga tudo", () => {
  const root = repo.insertFolder("Root", null);
  const child = repo.insertFolder("Child", root);
  repo.insertFlow({ folderId: child, title: "Fluxo com SVG", svgUrl: "/api/uploads/x.svg", bizagiData: { a: 1 } });
  repo.insertFlow({ folderId: root, title: "Sem SVG", svgUrl: null, bizagiData: {} });

  const svgs = repo.deleteFolderTree(root);
  assert.deepEqual(svgs, ["/api/uploads/x.svg"]);
  assert.equal(getDb().select().from(folders).where(eq(folders.id, child)).get(), undefined);
});

test("deleteFolderTree de pasta inexistente lança erro", () => {
  assert.throws(() => repo.deleteFolderTree("nao-existe"), /não encontrada/);
});

test("fluxos com mesmo título recebem slugs distintos", () => {
  const f = repo.insertFolder("Slugs", null);
  const id1 = repo.insertFlow({ folderId: f, title: "Processo de Compra", svgUrl: null, bizagiData: {} });
  const id2 = repo.insertFlow({ folderId: f, title: "Processo de Compra", svgUrl: null, bizagiData: {} });
  const s1 = getDb().select().from(flows).where(eq(flows.id, id1)).get()?.slug;
  const s2 = getDb().select().from(flows).where(eq(flows.id, id2)).get()?.slug;
  assert.equal(s1, "processo-de-compra");
  assert.ok(s2?.startsWith("processo-de-compra-"));
  assert.notEqual(s1, s2);
});

test("bizagi_data é preservado como JSON, inclusive acentos", () => {
  const f = repo.insertFolder("JSON", null);
  const payload = { pages: [{ name: "P", elements: [{ id: 1, name: "é ação" }] }] };
  const id = repo.insertFlow({ folderId: f, title: "Json", svgUrl: null, bizagiData: payload });
  const row = getDb().select().from(flows).where(eq(flows.id, id)).get();
  assert.deepEqual(row?.bizagi_data, payload);
});

test("ids gerados são UUIDs (mesmo formato dos dados originais)", () => {
  const id = repo.insertFolder("UUID", null);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.ok(path.isAbsolute(DB_PATH));
});
