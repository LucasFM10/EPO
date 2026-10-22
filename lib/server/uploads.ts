import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { UPLOADS_DIR } from "./config";

/** Nome de arquivo gerado pelo servidor: UUID + .svg ou .pdf. Nunca aceita caminhos do cliente. */
const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(svg|pdf)$/;
const UPLOAD_URL = /^\/api\/uploads\/([^/]+)$/;

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function contentTypeFor(fileName: string): string {
  return fileName.endsWith(".pdf") ? "application/pdf" : "image/svg+xml; charset=utf-8";
}

/** Verifica o cabeçalho de um PDF ("%PDF-") e o tamanho. Retorna o erro ou null. */
export function validatePdf(data: Buffer): string | null {
  if (data.length === 0) return "O arquivo PDF está vazio.";
  if (data.length > MAX_PDF_BYTES) return "O PDF excede o tamanho máximo de 50 MB.";
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") return "O arquivo não é um PDF válido.";
  return null;
}

export function uploadUrl(fileName: string): string {
  return `/api/uploads/${fileName}`;
}

/** Converte a URL pública armazenada no banco no nome de arquivo local. */
export function fileNameFromUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = UPLOAD_URL.exec(url);
  if (!match || !UPLOAD_NAME.test(match[1])) return null;
  return match[1];
}

export function resolveUpload(fileName: string): string | null {
  if (!UPLOAD_NAME.test(fileName)) return null;
  const full = path.join(UPLOADS_DIR, fileName);
  // Defesa adicional contra path traversal.
  if (path.dirname(full) !== path.resolve(UPLOADS_DIR)) return null;
  return full;
}

/** Grava o conteúdo com escrita atômica (arquivo temporário + rename). Retorna o nome gerado. */
export async function saveSvg(content: string): Promise<string> {
  return writeAtomic(`${randomUUID()}.svg`, content);
}

/** Grava um PDF já validado. Retorna o nome gerado. */
export async function savePdf(data: Buffer): Promise<string> {
  return writeAtomic(`${randomUUID()}.pdf`, data);
}

async function writeAtomic(fileName: string, data: string | Buffer): Promise<string> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const target = path.join(UPLOADS_DIR, fileName);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, target);
  return fileName;
}

/** Remove um upload. Ignora arquivo ausente, para não bloquear a exclusão do registro. */
export async function removeUpload(url: string | null | undefined): Promise<void> {
  const fileName = fileNameFromUploadUrl(url);
  if (!fileName) return;
  const full = resolveUpload(fileName);
  if (!full) return;
  await fs.unlink(full).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}
