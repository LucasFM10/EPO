"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, users } from "../db";
import { hashPassword, verifyPassword } from "../server/password";
import { clearFailures, isRateLimited, registerFailure } from "../server/rate-limit";
import { endSession, getSessionUser, startSession, type SessionUser } from "../server/session";

export interface LoginState {
  error?: string;
}

const GENERIC_ERROR = "E-mail ou senha inválidos.";
const RATE_LIMIT_ERROR = "Muitas tentativas. Aguarde 15 minutos e tente novamente.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// Hash de referência usado quando o e-mail não existe, para o tempo de resposta não revelar contas.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("epo-dummy-password-for-timing");
  return dummyHash;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password || password.length > 1024) {
    return { error: GENERIC_ERROR };
  }

  const keys = [`ip:${await clientIp()}`, `email:${email}`];
  if (keys.some(isRateLimited)) {
    return { error: RATE_LIMIT_ERROR };
  }

  const user = getDb().select().from(users).where(eq(users.email, email)).get();
  let valid = false;
  if (user) {
    valid = await verifyPassword(user.password_hash, password);
  } else {
    await verifyPassword(await getDummyHash(), password);
  }

  if (!user || !valid) {
    keys.forEach(registerFailure);
    return { error: GENERIC_ERROR };
  }

  clearFailures(`email:${email}`);
  await startSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

/** Usuário logado atual (ou null). Usado pelo AuthProvider e pelas páginas protegidas. */
export async function currentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
