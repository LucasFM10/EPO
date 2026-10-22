import { hash, verify } from "@node-rs/argon2";

/** Parâmetros Argon2id recomendados pela OWASP (m=19 MiB, t=2, p=1). */
const HASH_OPTIONS = {
  algorithm: 2, // Argon2id (const enum do pacote, valor literal por isolatedModules)
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}
