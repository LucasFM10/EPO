import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Mensagem legível de um erro capturado (evita `any` nos blocos catch). */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
