import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, getSqlite, folders, flows } from "../db";

/**
 * Operações de banco sem verificação de autenticação.
 * Quem chama deve ter validado a sessão e os dados de entrada (ver lib/mutations.ts).
 */

export function folderExists(id: string): boolean {
  return !!getDb().select({ id: folders.id }).from(folders).where(eq(folders.id, id)).get();
}

/** IDs da pasta informada e de todas as subpastas (CTE recursiva). */
export function subtreeIds(folderId: string): string[] {
  return getSqlite()
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM folders WHERE id = ?
         UNION ALL
         SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
       )
       SELECT id FROM sub`
    )
    .all(folderId)
    .map((r) => (r as { id: string }).id);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Gera um slug livre. Em caso de colisão, acrescenta um sufixo aleatório (comportamento original). */
export function uniqueSlug(base: string): string {
  const db = getDb();
  let candidate = base;
  while (db.select({ id: flows.id }).from(flows).where(eq(flows.slug, candidate)).get()) {
    candidate = `${base}-${randomBytes(2).toString("hex").slice(0, 3)}`;
  }
  return candidate;
}

export function insertFolder(name: string, parentId: string | null): string {
  const id = randomUUID();
  getDb().insert(folders).values({ id, name, parent_id: parentId }).run();
  return id;
}

export function insertFlow(input: {
  folderId: string;
  title: string;
  svgUrl: string | null;
  bizagiData: Record<string, unknown>;
}): string {
  const id = randomUUID();
  getDb()
    .insert(flows)
    .values({
      id,
      folder_id: input.folderId,
      title: input.title,
      slug: uniqueSlug(slugify(input.title) || "fluxo"),
      svg_url: input.svgUrl,
      bizagi_data: input.bizagiData,
    })
    .run();
  return id;
}

/**
 * Exclui a pasta (e, por cascade, subpastas e fluxos).
 * Retorna os svg_url dos fluxos removidos para que o chamador apague os arquivos após o commit.
 */
export function deleteFolderTree(id: string): string[] {
  const sqlite = getSqlite();
  const ids = subtreeIds(id);
  if (ids.length === 0) throw new Error("Pasta não encontrada.");

  const placeholders = ids.map(() => "?").join(",");
  const svgUrls = sqlite
    .prepare(`SELECT svg_url FROM flows WHERE folder_id IN (${placeholders})`)
    .all(...ids)
    .map((r) => (r as { svg_url: string | null }).svg_url)
    .filter((u): u is string => !!u);

  sqlite.prepare("DELETE FROM folders WHERE id = ?").run(id);
  return svgUrls;
}

export function deleteFlowRow(id: string): string | null {
  const db = getDb();
  const row = db.select({ svg_url: flows.svg_url }).from(flows).where(eq(flows.id, id)).get();
  if (!row) throw new Error("Fluxo não encontrado.");
  db.delete(flows).where(eq(flows.id, id)).run();
  return row.svg_url;
}

export function renameFolderRow(id: string, name: string): void {
  const result = getDb().update(folders).set({ name }).where(eq(folders.id, id)).run();
  if (result.changes === 0) throw new Error("Pasta não encontrada.");
}

export function renameFlowRow(id: string, title: string): void {
  const result = getDb().update(flows).set({ title }).where(eq(flows.id, id)).run();
  if (result.changes === 0) throw new Error("Fluxo não encontrado.");
}

/** Move a pasta. Bloqueia ciclos: mover para ela mesma ou para uma subpasta sua. */
export function moveFolderRow(id: string, newParentId: string | null): void {
  if (id === newParentId) throw new Error("Não é possível mover uma pasta para dentro dela mesma.");
  if (newParentId) {
    if (!folderExists(newParentId)) throw new Error("Pasta de destino não encontrada.");
    if (subtreeIds(id).includes(newParentId)) {
      throw new Error("Não é possível mover uma pasta para dentro de uma de suas subpastas.");
    }
  }
  const result = getDb()
    .update(folders)
    .set({ parent_id: newParentId })
    .where(eq(folders.id, id))
    .run();
  if (result.changes === 0) throw new Error("Pasta não encontrada.");
}

export function moveFlowRow(id: string, newFolderId: string): void {
  if (!folderExists(newFolderId)) throw new Error("Pasta de destino não encontrada.");
  const result = getDb().update(flows).set({ folder_id: newFolderId }).where(eq(flows.id, id)).run();
  if (result.changes === 0) throw new Error("Fluxo não encontrado.");
}
