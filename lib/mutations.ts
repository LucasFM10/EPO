"use server";

import { eq } from "drizzle-orm";
import { getDb, getSqlite, folders, flows } from "./db";
import { requireUser } from "./server/session";
import { MAX_BIZAGI_JSON_BYTES } from "./server/config";
import { validateSvg } from "./server/svg";
import { removeUpload, saveSvg, uploadUrl } from "./server/uploads";
import * as repo from "./server/repo";

const MAX_NAME = 200;

/** Valida e normaliza um texto de nome/título. */
function cleanName(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`Informe ${label}.`);
  if (text.length > MAX_NAME) throw new Error(`O texto deve ter no máximo ${MAX_NAME} caracteres.`);
  return text;
}

/** Cria uma pasta. Exige login. */
export async function createFolder(name: string, parentId: string | null) {
  await requireUser();
  const cleaned = cleanName(name, "o nome da pasta");
  if (parentId && !repo.folderExists(parentId)) throw new Error("Pasta não encontrada.");
  const id = repo.insertFolder(cleaned, parentId || null);
  return getDb().select().from(folders).where(eq(folders.id, id)).get();
}

/**
 * Cria um fluxo a partir do JSON do Bizagi, com SVG opcional.
 * O SVG é gravado antes do INSERT e removido se o INSERT falhar (sem arquivo órfão).
 */
export async function createFlow(
  folderId: string,
  title: string,
  bizagiJson: Record<string, unknown>,
  svgContent?: string | null
) {
  await requireUser();
  const cleanedTitle = cleanName(title, "o título do fluxo");
  if (!repo.folderExists(folderId)) throw new Error("Pasta não encontrada.");

  if (!bizagiJson || typeof bizagiJson !== "object" || Array.isArray(bizagiJson)) {
    throw new Error("O JSON do Bizagi é inválido.");
  }
  if (Buffer.byteLength(JSON.stringify(bizagiJson), "utf8") > MAX_BIZAGI_JSON_BYTES) {
    throw new Error("O JSON do Bizagi excede o tamanho máximo permitido.");
  }

  let svgUrl: string | null = null;
  if (svgContent) {
    const error = validateSvg(svgContent);
    if (error) throw new Error(error);
    svgUrl = uploadUrl(await saveSvg(svgContent));
  }

  try {
    const id = repo.insertFlow({ folderId, title: cleanedTitle, svgUrl, bizagiData: bizagiJson });
    return getDb().select().from(flows).where(eq(flows.id, id)).get();
  } catch (err) {
    await removeUpload(svgUrl);
    throw err;
  }
}

/** Exclui uma pasta com subpastas e fluxos. Arquivos SVG são removidos após o commit. */
export async function deleteFolder(id: string) {
  await requireUser();
  const svgUrls = getSqlite().transaction(() => repo.deleteFolderTree(id))();
  for (const url of svgUrls) await removeUpload(url);
}

/** Exclui um fluxo e seu SVG. */
export async function deleteFlow(id: string) {
  await requireUser();
  const svgUrl = getSqlite().transaction(() => repo.deleteFlowRow(id))();
  await removeUpload(svgUrl);
}

export async function renameFolder(id: string, newName: string) {
  await requireUser();
  repo.renameFolderRow(id, cleanName(newName, "o nome da pasta"));
}

export async function renameFlow(id: string, newTitle: string) {
  await requireUser();
  repo.renameFlowRow(id, cleanName(newTitle, "o título do fluxo"));
}

export async function moveFolder(id: string, newParentId: string | null) {
  await requireUser();
  repo.moveFolderRow(id, newParentId || null);
}

export async function moveFlow(id: string, newFolderId: string) {
  await requireUser();
  repo.moveFlowRow(id, newFolderId);
}
