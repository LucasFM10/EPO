import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { getSqlite } from "../db";
import { MAX_BIZAGI_JSON_BYTES, MAX_SVG_BYTES, UPLOADS_DIR } from "./config";
import { validateSvg } from "./svg";
import { fileNameFromUploadUrl, resolveUpload, uploadUrl, validatePdf } from "./uploads";
import { uniqueSlug } from "./repo";

/**
 * Importa o .zip gerado por lib/server/backup-export.ts (formato "epo-export" v1).
 *
 * SUBSTITUI todas as pastas e fluxos pelos do arquivo. Usuários e sessões não são alterados.
 *
 * Ordem das operações:
 * 1. Valida o arquivo inteiro (JSON, ids, SVGs). Nada é apagado antes disso.
 * 2. Grava os SVGs novos.
 * 3. Em uma transação: apaga pastas e fluxos e insere os do arquivo, com checagem de FK.
 * 4. Só depois do commit remove os SVGs antigos.
 * Se a transação falhar, os SVGs novos são removidos e o banco fica como estava.
 */

export const EXPORT_FORMAT = "epo-export";
/** v2 acrescenta o PDF de cada fluxo (pdf/<id>.pdf). A v1 continua sendo aceita. */
export const EXPORT_VERSION = 2;
const SUPPORTED_VERSIONS = [1, 2];
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_NAME = 200;

export interface ImportReport {
  removed: { folders: number; flows: number };
  folders: number;
  flows: number;
  svgs: { written: number; invalid: string[] };
  pdfs: { written: number; invalid: string[] };
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
  pdf: string | null;
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
  if (!SUPPORTED_VERSIONS.includes(data.version as number)) {
    fail(`Versão de exportação não suportada: ${String(data.version)}.`);
  }
  if (!Array.isArray(data.folders) || !Array.isArray(data.flows)) fail("Exportação sem as listas folders e flows.");

  const folders = (data.folders as Record<string, unknown>[]).map((f): ExportFolder => {
    asObject(f, "Pasta");
    return {
      id: assertId(f.id, "ID de pasta"),
      name: assertText(f.name, "Nome de pasta"),
      parent_id: f.parent_id == null ? null : assertId(f.parent_id, "ID da pasta pai"),
      created_at: typeof f.created_at === "string" ? f.created_at : undefined,
    };
  });

  const flows = (data.flows as Record<string, unknown>[]).map((f): ExportFlow => {
    asObject(f, "Fluxo");
    const svg = f.svg == null ? null : String(f.svg);
    const id = assertId(f.id, "ID de fluxo");
    if (svg !== null && svg !== `svg/${id}.svg`) fail(`Caminho de SVG inesperado no fluxo ${id}.`);
    const pdf = f.pdf == null ? null : String(f.pdf);
    if (pdf !== null && pdf !== `pdf/${id}.pdf`) fail(`Caminho de PDF inesperado no fluxo ${id}.`);
    if (f.bizagi_data != null && (typeof f.bizagi_data !== "object" || Array.isArray(f.bizagi_data))) {
      fail(`bizagi_data inválido no fluxo ${id}.`);
    }
    return {
      id,
      folder_id: assertId(f.folder_id, "ID da pasta do fluxo"),
      title: assertText(f.title, "Título de fluxo"),
      slug: assertText(f.slug, "Slug de fluxo"),
      svg,
      pdf,
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
function orderFolders(folders: ExportFolder[], issues: string[]): ExportFolder[] {
  const inFile = new Set(folders.map((f) => f.id));
  const placed = new Set<string>();
  const ordered: ExportFolder[] = [];
  let pending = folders.map((f) => ({ ...f }));

  while (pending.length) {
    let ready = pending.filter((f) => !f.parent_id || placed.has(f.parent_id) || !inFile.has(f.parent_id));
    if (ready.length === 0) {
      issues.push(`${pending.length} pasta(s) com referência circular; importadas na raiz.`);
      for (const f of pending) f.parent_id = null;
      ready = pending;
    }
    for (const f of ready) {
      if (f.parent_id && !inFile.has(f.parent_id)) {
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

function countRows(table: "folders" | "flows"): number {
  return (getSqlite().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
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
    removed: { folders: 0, flows: 0 },
    folders: 0,
    flows: 0,
    svgs: { written: 0, invalid: [] },
    pdfs: { written: 0, invalid: [] },
    issues: [],
  };

  const folderIds = new Set(folders.map((f) => f.id));
  const orderedFolders = orderFolders(folders, report.issues);
  const usableFlows = flows.filter((f) => {
    if (!folderIds.has(f.folder_id)) {
      report.issues.push(`Fluxo "${f.title}" aponta para pasta inexistente; ignorado.`);
      return false;
    }
    return true;
  });

  const sqlite = getSqlite();
  report.removed = { folders: countRows("folders"), flows: countRows("flows") };
  const oldFileUrls = (
    sqlite.prepare("SELECT svg_url, pdf_url FROM flows").all() as { svg_url: string | null; pdf_url: string | null }[]
  ).flatMap((r) => [r.svg_url, r.pdf_url]).filter((u): u is string => !!u);

  // SVGs e PDFs novos: validados e gravados antes de tocar no banco.
  const writtenFiles: string[] = [];
  const svgUrlByFlow = new Map<string, string | null>();
  const pdfUrlByFlow = new Map<string, string | null>();
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    for (const flow of usableFlows) {
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
      const full = resolveUpload(name);
      if (!full) fail("Nome de arquivo interno inválido.");
      fs.writeFileSync(full, content, "utf8");
      writtenFiles.push(full);
      report.svgs.written++;
      svgUrlByFlow.set(flow.id, uploadUrl(name));
    }

    for (const flow of usableFlows) {
      if (!flow.pdf) {
        pdfUrlByFlow.set(flow.id, null);
        continue;
      }
      const entry = zip.file(flow.pdf);
      if (!entry) {
        report.pdfs.invalid.push(`${flow.title} (arquivo ausente no zip)`);
        pdfUrlByFlow.set(flow.id, null);
        continue;
      }
      const data = Buffer.from(await entry.async("uint8array"));
      const pdfError = validatePdf(data);
      if (pdfError) {
        report.pdfs.invalid.push(`${flow.title} (${pdfError})`);
        pdfUrlByFlow.set(flow.id, null);
        continue;
      }
      const name = `${randomUUID()}.pdf`;
      const full = resolveUpload(name);
      if (!full) fail("Nome de arquivo interno inválido.");
      fs.writeFileSync(full, data);
      writtenFiles.push(full);
      report.pdfs.written++;
      pdfUrlByFlow.set(flow.id, uploadUrl(name));
    }

    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM flows").run();
      sqlite.prepare("DELETE FROM folders").run();

      const insFolder = sqlite.prepare("INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)");
      for (const f of orderedFolders) {
        insFolder.run(f.id, f.name, f.parent_id, f.created_at ?? new Date().toISOString());
        report.folders++;
      }

      const insFlow = sqlite.prepare(
        "INSERT INTO flows (id, folder_id, title, slug, svg_url, pdf_url, bizagi_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      for (const f of usableFlows) {
        const json = f.bizagi_data == null ? null : JSON.stringify(f.bizagi_data);
        if (json && Buffer.byteLength(json, "utf8") > MAX_BIZAGI_JSON_BYTES) {
          fail(`O JSON do fluxo "${f.title}" excede o tamanho máximo.`);
        }
        const slug = uniqueSlug(f.slug);
        if (slug !== f.slug) report.issues.push(`Slug de "${f.title}" ajustado para "${slug}".`);
        insFlow.run(
          f.id,
          f.folder_id,
          f.title,
          slug,
          svgUrlByFlow.get(f.id) ?? null,
          pdfUrlByFlow.get(f.id) ?? null,
          json,
          f.created_at ?? new Date().toISOString()
        );
        report.flows++;
      }

      const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) fail("Violação de integridade após a importação; nada foi alterado.");
    })();
  } catch (err) {
    for (const file of writtenFiles) fs.rmSync(file, { force: true });
    if (err instanceof ImportError) throw err;
    throw new ImportError(`Falha ao importar: ${(err as Error).message}`);
  }

  // Commit feito: agora é seguro remover os SVGs que pertenciam aos dados substituídos.
  for (const url of oldFileUrls) {
    const name = fileNameFromUploadUrl(url);
    const full = name ? resolveUpload(name) : null;
    if (full) fs.rmSync(full, { force: true });
  }

  return report;
}

export { ImportError };
