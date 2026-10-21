import JSZip from "jszip";
import { supabase } from "./supabase";

/** Formato do arquivo exportado. Deve ser o mesmo lido pela importação na branch dev. */
export const EXPORT_FORMAT = "epo-export";
export const EXPORT_VERSION = 1;

export interface ExportResult {
  fileName: string;
  flows: number;
  folders: number;
  /** Títulos dos fluxos cujo SVG não pôde ser baixado (o fluxo é exportado sem SVG). */
  missingSvg: string[];
}

/**
 * Exporta todas as pastas e fluxos (com bizagi_data) e os SVGs em um .zip,
 * e dispara o download no navegador.
 *
 * Estrutura do zip:
 *   epo-export.json   metadados, pastas e fluxos
 *   svg/<id>.svg      SVG de cada fluxo que possui um
 */
export async function exportAllFlows(): Promise<ExportResult> {
  const [foldersRes, flowsRes] = await Promise.all([
    supabase.from("folders").select("id, name, parent_id, created_at"),
    supabase.from("flows").select("id, folder_id, title, slug, svg_url, bizagi_data, created_at"),
  ]);
  if (foldersRes.error) throw foldersRes.error;
  if (flowsRes.error) throw flowsRes.error;

  const zip = new JSZip();
  const svgDir = zip.folder("svg")!;
  const missingSvg: string[] = [];

  const flows = [];
  for (const flow of flowsRes.data ?? []) {
    let svg: string | null = null;
    if (flow.svg_url) {
      try {
        const res = await fetch(flow.svg_url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        svgDir.file(`${flow.id}.svg`, await res.text());
        svg = `svg/${flow.id}.svg`;
      } catch {
        missingSvg.push(flow.title);
      }
    }
    flows.push({
      id: flow.id,
      folder_id: flow.folder_id,
      title: flow.title,
      slug: flow.slug,
      svg,
      bizagi_data: flow.bizagi_data,
      created_at: flow.created_at,
    });
  }

  const exportedAt = new Date().toISOString();
  const folders = foldersRes.data ?? [];
  zip.file(
    "epo-export.json",
    JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, folders, flows }, null, 2)
  );

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const fileName = `epo-export-${exportedAt.slice(0, 10)}.zip`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { fileName, flows: flows.length, folders: folders.length, missingSvg };
}
