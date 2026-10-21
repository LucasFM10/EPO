/**
 * Limitador simples em memória para tentativas de login.
 * Adequado a uma única instância da aplicação (o estado reinicia com o processo).
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const failures = new Map<string, { count: number; firstAt: number }>();

function prune(now: number) {
  for (const [key, entry] of failures) {
    if (now - entry.firstAt > WINDOW_MS) failures.delete(key);
  }
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  prune(now);
  const entry = failures.get(key);
  return !!entry && entry.count >= MAX_FAILURES && now - entry.firstAt <= WINDOW_MS;
}

export function registerFailure(key: string): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
