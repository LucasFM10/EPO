import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Cria um DATA_DIR temporário e aponta a aplicação para ele.
 * Deve ser chamado ANTES de importar módulos que leem DATA_DIR (lib/server/config.ts).
 */
export function useTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epo-test-"));
  process.env.DATA_DIR = dir;
  return dir;
}

export function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
