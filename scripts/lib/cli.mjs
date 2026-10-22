import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** true quando o próprio arquivo está sendo executado (não importado). */
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(importMetaUrl));
}

/**
 * Lê uma senha sem eco no terminal. Se stdin não for TTY (ex.: `--password-stdin`),
 * lê a primeira linha de stdin. A senha nunca é gravada em arquivo nem em log.
 */
export function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("error", reject);
      process.stdin.on("end", () => resolve(data.split(/\r?\n/)[0]));
    });
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener("data", onData);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          return resolve(value);
        }
        if (ch === "\u0003") {
          cleanup();
          return reject(new Error("Operação cancelada."));
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
