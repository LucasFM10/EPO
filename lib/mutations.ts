"use server";

import { eq } from "drizzle-orm";
import { getDb, getSqlite, folders, flows } from "./db";
import { requireUser } from "./server/session";
import { MAX_BIZAGI_JSON_BYTES, MAX_SVG_BYTES } from "./server/config";
import { validateSvg } from "./server/svg";
import { removeUpload, saveSvg, uploadUrl } from "./server/uploads";
import * as repo from "./server/repo";

const MAX_NAME = 200;
const FOLDER_NAME_TAKEN = "Já existe uma pasta com este nome neste nível. Escolha outro nome.";
const FLOW_NAME_TAKEN = "Já existe um fluxo com este nome nesta pasta. Escolha outro nome.";

/** Valida e normaliza um texto de nome/título. */
function cleanName(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`Informe ${label}.`);
  if (text.length > MAX_NAME) throw new Error(`O texto deve ter no máximo ${MAX_NAME} caracteres.`);
  return text;
}

function validateBizagi(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("O JSON do Bizagi é inválido.");
  if (Buffer.byteLength(JSON.stringify(json), "utf8") > MAX_BIZAGI_JSON_BYTES) {
    throw new Error("O JSON do Bizagi excede o tamanho máximo permitido.");
  }
  return json as Record<string, unknown>;
}

/** Valida o SVG e grava o arquivo. Quem chama deve remover a URL se a operação seguinte falhar. */
async function storeSvg(content: string): Promise<string> {
  if (Buffer.byteLength(content, "utf8") > MAX_SVG_BYTES) throw new Error("O SVG excede o tamanho máximo permitido.");
  const error = validateSvg(content);
  if (error) throw new Error(error);
  return uploadUrl(await saveSvg(content));
}

function folderRow(id: string) {
  const row = getDb().select().from(folders).where(eq(folders.id, id)).get();
  if (!row) throw new Error("Pasta não encontrada.");
  return row;
}

function flowRow(id: string) {
  const row = getDb().select().from(flows).where(eq(flows.id, id)).get();
  if (!row) throw new Error("Fluxo não encontrado.");
  return row;
}

/** Cria uma pasta. Exige login. Nome repetido no mesmo nível é recusado. */
export async function createFolder(name: string, parentId: string | null) {
  await requireUser();
  const cleaned = cleanName(name, "o nome da pasta");
  if (parentId && !repo.folderExists(parentId)) throw new Error("Pasta não encontrada.");
  if (repo.folderNameTaken(parentId || null, cleaned)) throw new Error(FOLDER_NAME_TAKEN);
  const id = repo.insertFolder(cleaned, parentId || null);
  return folderRow(id);
}

/**
 * Cria um fluxo. Tudo é opcional além da pasta e do título: pode ser criado vazio
 * e receber SVG, PDF ou Bizagi depois.
 */
export async function createFlow(
  folderId: string,
  title: string,
  bizagiJson?: Record<string, unknown> | null,
  svgContent?: string | null
) {
  await requireUser();
  const cleanedTitle = cleanName(title, "o título do fluxo");
  if (!repo.folderExists(folderId)) throw new Error("Pasta não encontrada.");
  if (repo.flowTitleTaken(folderId, cleanedTitle)) throw new Error(FLOW_NAME_TAKEN);

  const bizagi = bizagiJson == null ? null : validateBizagi(bizagiJson);
  const svgUrl = svgContent ? await storeSvg(svgContent) : null;

  try {
    const id = repo.insertFlow({ folderId, title: cleanedTitle, svgUrl, bizagiData: bizagi });
    return flowRow(id);
  } catch (err) {
    await removeUpload(svgUrl);
    throw err;
  }
}

/**
 * Cria vários fluxos de uma vez (importação do Bizagi). Valida todos os nomes antes de gravar:
 * nomes repetidos entre os itens ou já existentes na pasta recusam o lote inteiro.
 * Tudo ou nada: se algo falhar, os SVGs já gravados são removidos.
 */
export async function createFlowsBatch(
  folderId: string,
  items: { title: string; bizagiJson: Record<string, unknown> | null; svgContent: string | null }[]
): Promise<number> {
  await requireUser();
  if (!repo.folderExists(folderId)) throw new Error("Pasta não encontrada.");
  if (items.length === 0) throw new Error("Nenhum fluxo para importar.");

  const titles = items.map((item) => cleanName(item.title, "o título do fluxo"));
  const seen = new Set<string>();
  for (const title of titles) {
    const key = title.toLowerCase();
    if (seen.has(key)) throw new Error(`Nomes repetidos no lote: "${title}". Renomeie um deles.`);
    seen.add(key);
    if (repo.flowTitleTaken(folderId, title)) throw new Error(`${FLOW_NAME_TAKEN} ("${title}")`);
  }

  const bizagis = items.map((item) => (item.bizagiJson == null ? null : validateBizagi(item.bizagiJson)));
  const written: string[] = [];
  try {
    const svgUrls: (string | null)[] = [];
    for (const item of items) {
      const url = item.svgContent ? await storeSvg(item.svgContent) : null;
      if (url) written.push(url);
      svgUrls.push(url);
    }

    getSqlite().transaction(() => {
      titles.forEach((title, i) => {
        repo.insertFlow({ folderId, title, svgUrl: svgUrls[i], bizagiData: bizagis[i] });
      });
    })();
    return titles.length;
  } catch (err) {
    for (const url of written) await removeUpload(url);
    throw err;
  }
}

/** Exclui uma pasta com subpastas e fluxos. Arquivos (SVG e PDF) são removidos após o commit. */
export async function deleteFolder(id: string) {
  await requireUser();
  const fileUrls = getSqlite().transaction(() => repo.deleteFolderTree(id))();
  for (const url of fileUrls) await removeUpload(url);
}

/** Exclui um fluxo e seus arquivos. */
export async function deleteFlow(id: string) {
  await requireUser();
  const fileUrls = getSqlite().transaction(() => repo.deleteFlowRow(id))();
  for (const url of fileUrls) await removeUpload(url);
}

export async function renameFolder(id: string, newName: string) {
  await requireUser();
  const cleaned = cleanName(newName, "o nome da pasta");
  const current = folderRow(id);
  if (repo.folderNameTaken(current.parent_id, cleaned, id)) throw new Error(FOLDER_NAME_TAKEN);
  repo.renameFolderRow(id, cleaned);
}

export async function renameFlow(id: string, newTitle: string) {
  await requireUser();
  const cleaned = cleanName(newTitle, "o título do fluxo");
  const current = flowRow(id);
  if (repo.flowTitleTaken(current.folder_id, cleaned, id)) throw new Error(FLOW_NAME_TAKEN);
  repo.renameFlowRow(id, cleaned);
}

export async function moveFolder(id: string, newParentId: string | null) {
  await requireUser();
  const current = folderRow(id);
  const target = newParentId || null;
  if (repo.folderNameTaken(target, current.name, id)) throw new Error(FOLDER_NAME_TAKEN);
  repo.moveFolderRow(id, target);
}

export async function moveFlow(id: string, newFolderId: string) {
  await requireUser();
  const current = flowRow(id);
  if (repo.flowTitleTaken(newFolderId, current.title, id)) throw new Error(FLOW_NAME_TAKEN);
  repo.moveFlowRow(id, newFolderId);
}

/**
 * Anexa (ou troca) o SVG de um fluxo. Se o fluxo tinha Bizagi, a camada clicável é removida,
 * porque ela pertence ao SVG anterior. A UI pede confirmação antes.
 */
export async function attachSvg(flowId: string, svgContent: string) {
  await requireUser();
  flowRow(flowId);
  const svgUrl = await storeSvg(svgContent);
  let obsolete: string[];
  try {
    obsolete = repo.updateFlowFiles(flowId, { svgUrl });
  } catch (err) {
    await removeUpload(svgUrl);
    throw err;
  }
  for (const url of obsolete) await removeUpload(url);
}

/** Remove o SVG do fluxo. Remove também o Bizagi, pelo mesmo motivo de attachSvg. */
export async function removeSvg(flowId: string) {
  await requireUser();
  flowRow(flowId);
  const obsolete = repo.updateFlowFiles(flowId, { svgUrl: null });
  for (const url of obsolete) await removeUpload(url);
}

/**
 * Importa a página de um Bizagi para um fluxo existente: grava o SVG da página e a camada clicável.
 * Exige o SVG, porque os itens clicáveis só fazem sentido sobre ele. Substitui SVG e Bizagi anteriores.
 */
export async function attachBizagi(flowId: string, bizagiJson: Record<string, unknown>, svgContent: string) {
  await requireUser();
  flowRow(flowId);
  const bizagi = validateBizagi(bizagiJson);
  const svgUrl = await storeSvg(svgContent);
  let obsolete: string[];
  try {
    obsolete = repo.updateFlowFiles(flowId, { svgUrl, bizagiData: bizagi });
  } catch (err) {
    await removeUpload(svgUrl);
    throw err;
  }
  for (const url of obsolete) await removeUpload(url);
}

/** Remove o PDF do fluxo. */
export async function removePdf(flowId: string) {
  await requireUser();
  flowRow(flowId);
  const obsolete = repo.updateFlowFiles(flowId, { pdfUrl: null });
  for (const url of obsolete) await removeUpload(url);
}
