import JSZip from "jszip";
import fs from "node:fs";
import { getSqlite } from "../db";
import { EXPORT_FORMAT, EXPORT_VERSION } from "./backup-import";
import { fileNameFromUploadUrl, resolveUpload } from "./uploads";

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface FlowRow {
  id: string;
  folder_id: string;
  title: string;
  slug: string;
  svg_url: string | null;
  bizagi_data: string | null;
  created_at: string;
}

/**
 * Gera o .zip de backup no formato "epo-export" v1, o mesmo que o import aceita.
 * Inclui todas as pastas, fluxos (com bizagi_data) e SVGs que existem no disco.
 */
export async function buildExportZip(): Promise<{ buffer: Buffer; fileName: string }> {
  const sqlite = getSqlite();
  const folders = sqlite
    .prepare("SELECT id, name, parent_id, created_at FROM folders ORDER BY created_at")
    .all() as FolderRow[];
  const flows = sqlite
    .prepare("SELECT id, folder_id, title, slug, svg_url, bizagi_data, created_at FROM flows ORDER BY title")
    .all() as FlowRow[];

  const zip = new JSZip();
  const flowsOut = flows.map((flow) => {
    let svg: string | null = null;
    const name = fileNameFromUploadUrl(flow.svg_url);
    const full = name ? resolveUpload(name) : null;
    if (full && fs.existsSync(full)) {
      svg = `svg/${flow.id}.svg`;
      zip.file(svg, fs.readFileSync(full));
    }
    return {
      id: flow.id,
      folder_id: flow.folder_id,
      title: flow.title,
      slug: flow.slug,
      svg,
      bizagi_data: flow.bizagi_data ? JSON.parse(flow.bizagi_data) : null,
      created_at: flow.created_at,
    };
  });

  const manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    folders,
    flows: flowsOut,
  };
  zip.file("epo-export.json", JSON.stringify(manifest, null, 2));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const day = new Date().toISOString().slice(0, 10);
  return { buffer, fileName: `epo-export-${day}.zip` };
}
