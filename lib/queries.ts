"use server";

import { asc, eq } from "drizzle-orm";
import { getDb, folders, flows } from "./db";
import type { Folder, Flow, FolderTreeNode } from "./types";

const FLOW_LIST_COLUMNS = {
  id: flows.id,
  folder_id: flows.folder_id,
  title: flows.title,
  slug: flows.slug,
  svg_url: flows.svg_url,
  created_at: flows.created_at,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Busca todas as pastas e fluxos e monta a árvore aninhada.
 * Leitura pública, como no projeto original.
 */
export async function getFolderTree(): Promise<FolderTreeNode[]> {
  const db = getDb();
  const folderRows = db.select().from(folders).orderBy(asc(folders.name)).all() as Folder[];
  const flowRows = db
    .select(FLOW_LIST_COLUMNS)
    .from(flows)
    .orderBy(asc(flows.title))
    .all() as Flow[];

  const nodeMap = new Map<string, FolderTreeNode>();
  for (const folder of folderRows) {
    nodeMap.set(folder.id, { folder, children: [], flows: [] });
  }

  for (const flow of flowRows) {
    nodeMap.get(flow.folder_id)?.flows.push(flow);
  }

  const roots: FolderTreeNode[] = [];
  for (const folder of folderRows) {
    const node = nodeMap.get(folder.id)!;
    if (folder.parent_id && nodeMap.has(folder.parent_id)) {
      nodeMap.get(folder.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Busca um fluxo pelo ID (UUID) ou slug, incluindo o bizagi_data completo.
 */
export async function getFlowByIdOrSlug(identifier: string): Promise<Flow | null> {
  const db = getDb();
  const where = UUID_RE.test(identifier)
    ? eq(flows.id, identifier)
    : eq(flows.slug, identifier);

  const row = db.select().from(flows).where(where).get();
  return (row as Flow | undefined) ?? null;
}

/** Lista todos os fluxos sem o bizagi_data (leve, para listagem). */
export async function getAllFlows(): Promise<Flow[]> {
  return getDb()
    .select(FLOW_LIST_COLUMNS)
    .from(flows)
    .orderBy(asc(flows.title))
    .all() as Flow[];
}

/** Caminho da raiz até a pasta informada (para o breadcrumb). */
export async function getFolderBreadcrumb(folderId: string): Promise<Folder[]> {
  const all = getDb().select().from(folders).all() as Folder[];
  const folderMap = new Map<string, Folder>();
  for (const f of all) folderMap.set(f.id, f);

  const path: Folder[] = [];
  const visited = new Set<string>();
  let current = folderMap.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parent_id ? folderMap.get(current.parent_id) : undefined;
  }
  return path;
}
