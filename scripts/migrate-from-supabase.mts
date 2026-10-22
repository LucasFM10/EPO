// ===================================================================================
// TEMPORÁRIO — migração única do Supabase para o SQLite.
// Remover após a migração ser executada e validada (ver RELATORIO_REFATORACAO.md).
//
// Uso (credenciais em arquivo local, nunca na linha de comando):
//   node --env-file=.env.supabase-migration --import tsx scripts/migrate-from-supabase.mts --dry-run
//   node --env-file=.env.supabase-migration --import tsx scripts/migrate-from-supabase.mts
//
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY (somente leitura via REST).
// Não usa o SDK do Supabase e nunca imprime esses valores.
// Idempotente: registros já existentes (mesmo id) são ignorados.
// ===================================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate.mjs";
import { isMain } from "./lib/cli.mjs";
import { DATA_DIR, DB_PATH, UPLOADS_DIR } from "./lib/paths.mjs";
// Import padrão: os módulos TS são carregados como CJS pelo tsx (namespace não expõe os exports).
import svgLib from "../lib/server/svg";
import cfg from "../lib/server/config";

type SourceFolder = { id: string; name: string; parent_id: string | null; created_at: string };
type SourceFlow = {
  id: string;
  folder_id: string;
  title: string;
  slug: string;
  svg_url: string | null;
  bizagi_data: unknown;
  created_at: string;
};

interface Report {
  dryRun: boolean;
  startedAt: string;
  source: { folders: number; flows: number; flowsWithSvg: number; flowsWithRemoteSvg: number };
  inserted: { folders: number; flows: number };
  skippedExisting: { folders: number; flows: number };
  svg: { downloaded: number; failed: { flowId: string; reason: string }[] };
  issues: string[];
  validation: { countsMatch: boolean; foreignKeyViolations: number; flowsWithoutFolder: number };
  notes: string[];
}

const PAGE = 1000;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não definida (ver .env.supabase-migration).`);
  return value;
}

/** Lê uma tabela inteira via PostgREST, paginando. Nenhum valor de credencial é registrado. */
async function fetchTable<T>(table: string): Promise<T[]> {
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_ANON_KEY");
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${base}/rest/v1/${table}?select=*&order=id&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Falha ao ler ${table}: HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Baixa um SVG remoto (URL pública do Storage) e valida antes de aceitar. */
async function fetchSvg(url: string): Promise<{ content?: string; reason?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { reason: `HTTP ${res.status}` };
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > cfg.MAX_SVG_BYTES) return { reason: "arquivo acima do limite" };
    const content = await res.text();
    const error = svgLib.validateSvg(content);
    if (error) return { reason: error };
    return { content };
  } catch (err) {
    return { reason: (err as Error).message };
  }
}

/** Lê ids de uma consulta em modo somente leitura e fecha a conexão. */
function readIds(sql: string): string[] {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return (db.prepare(sql).all() as { id: string }[]).map((r) => r.id);
  } finally {
    db.close();
  }
}

/** Ordena pastas para que pais sejam inseridos antes dos filhos (FK). */
function orderFolders(folders: SourceFolder[], issues: string[]): SourceFolder[] {
  const ids = new Set(folders.map((f) => f.id));
  const placed = new Set<string>();
  const ordered: SourceFolder[] = [];
  let pending = [...folders];
  while (pending.length) {
    const next = pending.filter((f) => !f.parent_id || !ids.has(f.parent_id) || placed.has(f.parent_id));
    if (next.length === 0) {
      issues.push(`${pending.length} pasta(s) com ciclo ou pai ausente; inseridas como raiz`);
      next.push(...pending);
    }
    for (const f of next) {
      ordered.push(f.parent_id && !ids.has(f.parent_id) ? { ...f, parent_id: null } : f);
      placed.add(f.id);
    }
    pending = pending.filter((f) => !placed.has(f.id));
  }
  return ordered;
}

export async function runSupabaseMigration(opts: { dryRun?: boolean } = {}) {
  const dryRun = opts.dryRun ?? process.argv.includes("--dry-run");
  const report: Report = {
    dryRun,
    startedAt: new Date().toISOString(),
    source: { folders: 0, flows: 0, flowsWithSvg: 0, flowsWithRemoteSvg: 0 },
    inserted: { folders: 0, flows: 0 },
    skippedExisting: { folders: 0, flows: 0 },
    svg: { downloaded: 0, failed: [] },
    issues: [],
    validation: { countsMatch: false, foreignKeyViolations: 0, flowsWithoutFolder: 0 },
    notes: [
      "Usuários do Supabase Auth NÃO são migrados: senhas não podem ser transferidas. Recrie os acessos com npm run user:create.",
    ],
  };

  runMigrations(DB_PATH);

  // Fluxos já migrados não devem ter o SVG baixado de novo (evita arquivos órfãos em re-execuções).
  const existingFlowIds = new Set(readIds("SELECT id FROM flows"));
  console.log(`[supabase→sqlite] destino: ${DB_PATH}${dryRun ? " (dry-run: nada será gravado)" : ""}`);

  const folders = await fetchTable<SourceFolder>("folders");
  const flows = await fetchTable<SourceFlow>("flows");
  report.source.folders = folders.length;
  report.source.flows = flows.length;
  report.source.flowsWithSvg = flows.filter((f) => f.svg_url).length;
  report.source.flowsWithRemoteSvg = flows.filter((f) => f.svg_url?.startsWith("http")).length;
  console.log(`[supabase→sqlite] origem: ${folders.length} pastas, ${flows.length} fluxos`);

  const folderIds = new Set(folders.map((f) => f.id));
  const orphanFlows = flows.filter((f) => !folderIds.has(f.folder_id));
  if (orphanFlows.length) report.issues.push(`${orphanFlows.length} fluxo(s) apontam para pasta inexistente na origem (serão ignorados)`);

  const slugCount = new Map<string, number>();
  for (const f of flows) slugCount.set(f.slug, (slugCount.get(f.slug) || 0) + 1);
  for (const [slug, n] of slugCount) if (n > 1) report.issues.push(`slug duplicado na origem: "${slug}" (${n}x)`);

  // Baixa SVGs remotos e grava em disco (somente fora do dry-run).
  const svgLocal = new Map<string, string | null>();
  const createdFiles: string[] = [];
  for (const flow of flows) {
    if (existingFlowIds.has(flow.id)) {
      svgLocal.set(flow.id, null);
      continue;
    }
    if (!flow.svg_url?.startsWith("http")) {
      svgLocal.set(flow.id, flow.svg_url ?? null);
      continue;
    }
    const result = await fetchSvg(flow.svg_url);
    if (!result.content) {
      report.svg.failed.push({ flowId: flow.id, reason: result.reason || "desconhecido" });
      svgLocal.set(flow.id, null);
      continue;
    }
    report.svg.downloaded++;
    if (dryRun) {
      svgLocal.set(flow.id, "(dry-run)");
    } else {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const name = `${crypto.randomUUID()}.svg`;
      const full = path.join(UPLOADS_DIR, name);
      fs.writeFileSync(full, result.content, "utf8");
      createdFiles.push(full);
      svgLocal.set(flow.id, `/api/uploads/${name}`);
    }
  }

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  try {
    db.exec("BEGIN IMMEDIATE");
    const existingFolders = new Set(
      (db.prepare("SELECT id FROM folders").all() as { id: string }[]).map((r) => r.id)
    );
    const existingFlows = new Set(
      (db.prepare("SELECT id FROM flows").all() as { id: string }[]).map((r) => r.id)
    );

    const insFolder = db.prepare(
      "INSERT OR IGNORE INTO folders (id, name, parent_id, created_at) VALUES (@id, @name, @parent_id, @created_at)"
    );
    for (const f of orderFolders(folders, report.issues)) {
      if (existingFolders.has(f.id)) {
        report.skippedExisting.folders++;
        continue;
      }
      insFolder.run({ id: f.id, name: f.name, parent_id: f.parent_id, created_at: f.created_at });
      report.inserted.folders++;
    }

    const insFlow = db.prepare(
      `INSERT OR IGNORE INTO flows (id, folder_id, title, slug, svg_url, bizagi_data, created_at)
       VALUES (@id, @folder_id, @title, @slug, @svg_url, @bizagi_data, @created_at)`
    );
    for (const f of flows) {
      if (!folderIds.has(f.folder_id)) continue;
      if (existingFlows.has(f.id)) {
        report.skippedExisting.flows++;
        continue;
      }
      insFlow.run({
        id: f.id,
        folder_id: f.folder_id,
        title: f.title,
        slug: f.slug,
        svg_url: svgLocal.get(f.id) ?? null,
        bizagi_data: f.bizagi_data == null ? null : JSON.stringify(f.bizagi_data),
        created_at: f.created_at,
      });
      report.inserted.flows++;
    }

    // Validação antes do commit.
    const fkViolations = db.prepare("PRAGMA foreign_key_check").all().length;
    const flowsWithoutFolder = (
      db.prepare("SELECT COUNT(*) AS n FROM flows WHERE folder_id NOT IN (SELECT id FROM folders)").get() as { n: number }
    ).n;
    const expectedFlows = flows.filter((f) => folderIds.has(f.folder_id)).length;
    const migratedFlows = report.inserted.flows + report.skippedExisting.flows;
    const migratedFolders = report.inserted.folders + report.skippedExisting.folders;
    report.validation = {
      countsMatch: migratedFolders === folders.length && migratedFlows === expectedFlows,
      foreignKeyViolations: fkViolations,
      flowsWithoutFolder,
    };
    if (fkViolations > 0 || flowsWithoutFolder > 0) throw new Error("Validação de integridade falhou; nada foi gravado.");
    if (!report.validation.countsMatch) throw new Error("Contagens de origem e destino não conferem; nada foi gravado.");

    if (dryRun) {
      db.exec("ROLLBACK");
      report.notes.push("dry-run: transação revertida, nenhum dado foi gravado.");
    } else {
      db.exec("COMMIT");
    }
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // transação já encerrada
    }
    for (const f of createdFiles) fs.rmSync(f, { force: true });
    report.issues.push(`erro: ${(err as Error).message}`);
    throw err;
  } finally {
    db.close();
    const reportPath = path.join(DATA_DIR, `migration-report-${report.startedAt.replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[supabase→sqlite] relatório: ${reportPath}`);
  }

  console.log(`[supabase→sqlite] inseridos: ${report.inserted.folders} pastas, ${report.inserted.flows} fluxos`);
  console.log(`[supabase→sqlite] já existentes (ignorados): ${report.skippedExisting.folders} pastas, ${report.skippedExisting.flows} fluxos`);
  console.log(`[supabase→sqlite] SVG baixados: ${report.svg.downloaded}, falhas: ${report.svg.failed.length}`);
  console.log(`[supabase→sqlite] validação: contagens ok=${report.validation.countsMatch}, violações FK=${report.validation.foreignKeyViolations}`);
}

if (isMain(import.meta.url)) {
  runSupabaseMigration().catch((err) => {
    console.error(`[supabase→sqlite] FALHOU: ${(err as Error).message}`);
    process.exit(1);
  });
}
