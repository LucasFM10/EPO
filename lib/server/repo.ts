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

export function flowExists(id: string): boolean {
  return !!getDb().select({ id: flows.id }).from(flows).where(eq(flows.id, id)).get();
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

/** Nome já usado por outra pasta no mesmo nível (comparação sem diferenciar maiúsculas e espaços). */
export function folderNameTaken(parentId: string | null, name: string, exceptId?: string): boolean {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM folders
       WHERE parent_id IS ? AND lower(trim(name)) = lower(trim(?)) AND id IS NOT ?
       LIMIT 1`
    )
    .get(parentId, name, exceptId ?? null);
  return !!row;
}

/** Título já usado por outro fluxo na mesma pasta. */
export function flowTitleTaken(folderId: string, title: string, exceptId?: string): boolean {
  const row = getSqlite()
    .prepare(
      `SELECT id FROM flows
       WHERE folder_id = ? AND lower(trim(title)) = lower(trim(?)) AND id IS NOT ?
       LIMIT 1`
    )
    .get(folderId, title, exceptId ?? null);
  return !!row;
}

export interface NewFlowInput {
  id?: string;
  folderId: string;
  title: string;
  svgUrl?: string | null;
  pdfUrl?: string | null;
  bizagiData?: Record<string, unknown> | null;
}

export function insertFlow(input: NewFlowInput): string {
  const id = input.id ?? randomUUID();
  getDb()
    .insert(flows)
    .values({
      id,
      folder_id: input.folderId,
      title: input.title,
      slug: uniqueSlug(slugify(input.title) || "fluxo"),
      svg_url: input.svgUrl ?? null,
      pdf_url: input.pdfUrl ?? null,
      bizagi_data: input.bizagiData ?? null,
    })
    .run();
  return id;
}

/**
 * Exclui a pasta (e, por cascade, subpastas e fluxos).
 * Retorna as URLs de SVG e PDF dos fluxos removidos para que o chamador apague os arquivos após o commit.
 */
export function deleteFolderTree(id: string): string[] {
  const sqlite = getSqlite();
  const ids = subtreeIds(id);
  if (ids.length === 0) throw new Error("Pasta não encontrada.");

  const placeholders = ids.map(() => "?").join(",");
  const fileUrls = sqlite
    .prepare(`SELECT svg_url, pdf_url FROM flows WHERE folder_id IN (${placeholders})`)
    .all(...ids)
    .flatMap((r) => {
      const row = r as { svg_url: string | null; pdf_url: string | null };
      return [row.svg_url, row.pdf_url];
    })
    .filter((u): u is string => !!u);

  sqlite.prepare("DELETE FROM folders WHERE id = ?").run(id);
  return fileUrls;
}

/** Exclui um fluxo. Retorna as URLs de arquivo (SVG e PDF) que devem ser apagadas após o commit. */
export function deleteFlowRow(id: string): string[] {
  const db = getDb();
  const row = db.select({ svg_url: flows.svg_url, pdf_url: flows.pdf_url }).from(flows).where(eq(flows.id, id)).get();
  if (!row) throw new Error("Fluxo não encontrado.");
  db.delete(flows).where(eq(flows.id, id)).run();
  return [row.svg_url, row.pdf_url].filter((u): u is string => !!u);
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

/**
 * Atualiza os arquivos de um fluxo. Campos omitidos não mudam; null remove.
 *
 * Regra: o Bizagi (camada clicável) pertence ao SVG da mesma página. Trocar ou remover o SVG
 * também remove o Bizagi, para que os itens clicáveis não fiquem desalinhados.
 * O PDF é independente e não é afetado.
 *
 * Retorna as URLs de arquivo substituídas, que o chamador apaga após o commit.
 */
export function updateFlowFiles(
  id: string,
  changes: { svgUrl?: string | null; pdfUrl?: string | null; bizagiData?: Record<string, unknown> | null }
): string[] {
  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT svg_url, pdf_url FROM flows WHERE id = ?").get(id) as
    | { svg_url: string | null; pdf_url: string | null }
    | undefined;
  if (!row) throw new Error("Fluxo não encontrado.");

  const sets: string[] = [];
  const values: unknown[] = [];
  const obsolete: string[] = [];

  if (changes.svgUrl !== undefined) {
    if (row.svg_url && row.svg_url !== changes.svgUrl) obsolete.push(row.svg_url);
    sets.push("svg_url = ?");
    values.push(changes.svgUrl);
    if (changes.bizagiData === undefined) {
      // Trocar ou remover o SVG descarta a camada interativa desta página.
      sets.push("bizagi_data = NULL");
    }
  }

  if (changes.pdfUrl !== undefined) {
    if (row.pdf_url && row.pdf_url !== changes.pdfUrl) obsolete.push(row.pdf_url);
    sets.push("pdf_url = ?");
    values.push(changes.pdfUrl);
  }

  if (changes.bizagiData !== undefined) {
    sets.push("bizagi_data = ?");
    values.push(changes.bizagiData === null ? null : JSON.stringify(changes.bizagiData));
  }

  if (sets.length > 0) {
    sqlite.prepare(`UPDATE flows SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return obsolete;
}
