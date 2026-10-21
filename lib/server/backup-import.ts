import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSqlite } from "../db";
import { MAX_BIZAGI_JSON_BYTES, MAX_SVG_BYTES, UPLOADS_DIR } from "./config";
import { validateSvg } from "./svg";
import { uploadUrl } from "./uploads";
import { uniqueSlug } from "./repo";

/**
 * Importa o .zip gerado pela exportação da branch main (formato "epo-export" v1).
 *
 * Regras:
 * - Não apaga nem altera nada existente. Pastas e fluxos com o mesmo id já presentes são ignorados,
 *   então importar o mesmo arquivo duas vezes não duplica dados.
 * - Os ids originais são preservados.
 * - Tudo ou nada: se o banco falhar, nada é gravado e os SVGs já escritos são removidos.
 */

export const EXPORT_FORMAT = "epo-export";
export const EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_NAME = 200;

export interface ImportReport {
  folders: { inserted: number; skipped: number };
  flows: { inserted: number; skipped: number };
  svgs: { written: number; invalid: string[] };
  issues: string[];
}

interface ExportFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at?: string;
}

interface ExportFlow {
  id: string;
  folder_id: string;
  title: string;
  slug: string;
  svg: string | null;
  bizagi_data: Record<string, unknown> | null;
  created_at?: string;
}

class ImportError extends Error {}

function fail(message: string): never {
  throw new ImportError(message);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} inválido no arquivo.`);
  return value as Record<string, unknown>;
}

function assertId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_RE.test(value)) fail(`${label} inválido: ${String(value).slice(0, 80)}`);
  return value;
}

function assertText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_NAME) {
    fail(`${label} inválido ou vazio.`);
  }
  return value.trim();
}

function parseExport(json: unknown): { folders: ExportFolder[]; flows: ExportFlow[] } {
  if (!json || typeof json !== "object") fail("O arquivo epo-export.json não é um objeto JSON.");
  const data = json as Record<string, unknown>;
  if (data.format !== EXPORT_FORMAT) fail("Formato desconhecido: este não é um arquivo de exportação do EPO.");
  if (data.version !== EXPORT_VERSION) fail(`Versão de exportação não suportada: ${String(data.version)}.`);
  if (!Array.isArray(data.folders) || !Array.isArray(data.flows)) fail("Exportação sem as listas folders e flows.");

  const folders = (data.folders as Record<string, unknown>[]).map((f): ExportFolder => ({
    ...(asObject(f, "Pasta")),
    id: assertId(f.id, "ID de pasta"),
    name: assertText(f.name, "Nome de pasta"),
    parent_id: f.parent_id == null ? null : assertId(f.parent_id, "ID da pasta pai"),
    created_at: typeof f.created_at === "string" ? f.created_at : undefined,
  }));

  const flows = (data.flows as Record<string, unknown>[]).map((f): ExportFlow => {
    asObject(f, "Fluxo");
    const svg = f.svg == null ? null : String(f.svg);
    const id = assertId(f.id, "ID de fluxo");
    if (svg !== null && svg !== `svg/${id}.svg`) fail(`Caminho de SVG inesperado no fluxo ${id}.`);
    if (f.bizagi_data !== null && f.bizagi_data !== undefined && (typeof f.bizagi_data !== "object" || Array.isArray(f.bizagi_data))) {
      fail(`bizagi_data inválido no fluxo ${id}.`);
    }
    return {
      id,
      folder_id: assertId(f.folder_id, "ID da pasta do fluxo"),
      title: assertText(f.title, "Título de fluxo"),
      slug: assertText(f.slug, "Slug de fluxo"),
      svg,
      bizagi_data: (f.bizagi_data as Record<string, unknown> | null) ?? null,
      created_at: typeof f.created_at === "string" ? f.created_at : undefined,
    };
  });

  for (const list of [folders, flows] as { id: string }[][]) {
    const seen = new Set<string>();
    for (const item of list) {
      if (seen.has(item.id)) fail(`ID duplicado no arquivo: ${item.id}`);
      seen.add(item.id);
    }
  }

  return { folders, flows };
}

/** Ordena pastas para que pais venham antes dos filhos (chave estrangeira). */
function orderFolders(folders: ExportFolder[], knownIds: Set<string>, issues: string[]): ExportFolder[] {
  const inFile = new Set(folders.map((f) => f.id));
  const placed = new Set<string>(knownIds);
  const ordered: ExportFolder[] = [];
  let pending = folders.map((f) => ({ ...f }));

  while (pending.length) {
    let ready = pending.filter((f) => !f.parent_id || placed.has(f.parent_id) || !inFile.has(f.parent_id));
    if (ready.length === 0) {
      issues.push(`${pending.length} pasta(s) com referência circular; importadas na raiz.`);
      ready = pending;
    }
    for (const f of ready) {
      if (f.parent_id && !inFile.has(f.parent_id) && !placed.has(f.parent_id)) {
        issues.push(`Pasta "${f.name}" tinha pai inexistente; importada na raiz.`);
        f.parent_id = null;
      }
      ordered.push(f);
      placed.add(f.id);
    }
    pending = pending.filter((f) => !placed.has(f.id));
  }
  return ordered;
}

export async function importExportZip(buffer: Buffer): Promise<ImportReport> {
  if (buffer.length > MAX_IMPORT_BYTES) fail("O arquivo excede o tamanho máximo de 200 MB.");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    fail("O arquivo não é um .zip válido.");
  }

  const manifest = zip.file("epo-export.json");
  if (!manifest) fail("O .zip não contém epo-export.json.");
  let json: unknown;
  try {
    json = JSON.parse(await manifest.async("string"));
  } catch {
    fail("epo-export.json não é um JSON válido.");
  }
  const { folders, flows } = parseExport(json);

  const report: ImportReport = {
    folders: { inserted: 0, skipped: 0 },
    flows: { inserted: 0, skipped: 0 },
    svgs: { written: 0, invalid: [] },
    issues: [],
  };

  const sqlite = getSqlite();
  const existingFolders = new Set((sqlite.prepare("SELECT id FROM folders").all() as { id: string }[]).map((r) => r.id));
  const existingFlows = new Set((sqlite.prepare("SELECT id FROM flows").all() as { id: string }[]).map((r) => r.id));
  const knownFolderIds = new Set([...existingFolders, ...folders.map((f) => f.id)]);

  // Pastas e fluxos novos apenas (ids já existentes são ignorados).
  const newFolders = orderFolders(
    folders.filter((f) => !existingFolders.has(f.id)),
    existingFolders,
    report.issues
  );
  report.folders.skipped = folders.length - newFolders.length;

  const newFlows = flows.filter((f) => {
    if (existingFlows.has(f.id)) {
      report.flows.skipped++;
      return false;
    }
    if (!knownFolderIds.has(f.folder_id)) {
      report.issues.push(`Fluxo "${f.title}" aponta para pasta inexistente; ignorado.`);
      return false;
    }
    return true;
  });

  // SVGs: validados e gravados antes do banco. Se o banco falhar, são removidos.
  const writtenFiles: string[] = [];
  const svgUrlByFlow = new Map<string, string | null>();
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    for (const flow of newFlows) {
      if (!flow.svg) {
        svgUrlByFlow.set(flow.id, null);
        continue;
      }
      const entry = zip.file(flow.svg);
      if (!entry) {
        report.svgs.invalid.push(`${flow.title} (arquivo ausente no zip)`);
        svgUrlByFlow.set(flow.id, null);
        continue;
      }
      const content = await entry.async("string");
      if (Buffer.byteLength(content, "utf8") > MAX_SVG_BYTES) {
        report.svgs.invalid.push(`${flow.title} (acima do limite)`);
        svgUrlByFlow.set(flow.id, null);
        continue;
      }
      const error = validateSvg(content);
      if (error) {
        report.svgs.invalid.push(`${flow.title} (${error})`);
        svgUrlByFlow.set(flow.id, null);
        continue;
      }
      const name = `${randomUUID()}.svg`;
      const full = path.join(UPLOADS_DIR, name);
      fs.writeFileSync(full, content, "utf8");
      writtenFiles.push(full);
      report.svgs.written++;
      svgUrlByFlow.set(flow.id, uploadUrl(name));
    }

    sqlite.transaction(() => {
      const insFolder = sqlite.prepare(
        "INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)"
      );
      for (const f of newFolders) {
        insFolder.run(f.id, f.name, f.parent_id, f.created_at ?? new Date().toISOString());
        report.folders.inserted++;
      }

      const insFlow = sqlite.prepare(
        "INSERT INTO flows (id, folder_id, title, slug, svg_url, bizagi_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const f of newFlows) {
        const json = f.bizagi_data == null ? null : JSON.stringify(f.bizagi_data);
        if (json && Buffer.byteLength(json, "utf8") > MAX_BIZAGI_JSON_BYTES) {
          fail(`O JSON do fluxo "${f.title}" excede o tamanho máximo.`);
        }
        const slug = uniqueSlug(f.slug);
        if (slug !== f.slug) report.issues.push(`Slug de "${f.title}" ajustado para "${slug}".`);
        insFlow.run(f.id, f.folder_id, f.title, slug, svgUrlByFlow.get(f.id) ?? null, json, f.created_at ?? new Date().toISOString());
        report.flows.inserted++;
      }

      const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) fail("Violação de integridade após a importação; nada foi gravado.");
    })();
  } catch (err) {
    for (const file of writtenFiles) fs.rmSync(file, { force: true });
    if (err instanceof ImportError) throw err;
    throw new ImportError(`Falha ao importar: ${(err as Error).message}`);
  }

  return report;
}

export { ImportError };
