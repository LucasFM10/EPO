import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, sessions, users } from "../db";
import { COOKIE_SECURE, SESSION_TTL_MS } from "./config";

export const SESSION_COOKIE = "epo_session";

export interface SessionUser {
  id: string;
  email: string;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/**
 * Cria uma sessão nova para o usuário e grava o cookie.
 * Sempre gera um token novo (proteção contra session fixation) e
 * descarta qualquer sessão anterior enviada pelo navegador.
 */
export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  const previous = jar.get(SESSION_COOKIE)?.value;
  const db = getDb();
  if (previous) {
    db.delete(sessions).where(eq(sessions.id, sha256(previous))).run();
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  db.insert(sessions)
    .values({ id: sha256(token), user_id: userId, expires_at: expiresAt })
    .run();

  jar.set(SESSION_COOKIE, token, cookieOptions(new Date(expiresAt)));
}

/** Retorna o usuário da sessão atual, ou null se não houver sessão válida. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expires_at, Date.now())))
    .get();

  // Limpeza oportunista de sessões expiradas.
  db.delete(sessions).where(lt(sessions.expires_at, Date.now())).run();

  return row ?? null;
}

/** Usado pelas Server Actions que exigem login. Lança erro se não autenticado. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Você precisa estar logado para realizar esta ação.");
  }
  return user;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().delete(sessions).where(eq(sessions.id, sha256(token))).run();
  }
  jar.set(SESSION_COOKIE, "", cookieOptions(new Date(0)));
}
