"use client";

import React, { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { login, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [state, formAction, pending] = useActionState(login, initialState);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-bold uppercase text-[10px] tracking-widest text-black">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center pt-20 p-4">
      <div className="mb-8 flex flex-col items-center">
        <img src="/brasão_tjpb.png" alt="Brasão TJPB" className="h-64 w-auto object-contain" />
      </div>

      <div className="w-full max-w-sm border border-black p-8 bg-white">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-tight text-black">Acesso Administrativo</p>
        </div>

        <form action={formAction} className="space-y-6">
          {state.error && (
            <div className="p-3 border border-red-600 text-sm text-red-600 bg-red-50">
              {state.error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-bold uppercase">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="w-full px-3 py-2 border border-black text-sm focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-bold uppercase">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 border border-black text-sm focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 bg-black text-white text-sm font-bold uppercase hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
          >
            {pending ? "Carregando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] text-gray-500 uppercase tracking-widest">
          Acesso Restrito
        </p>
      </div>
    </div>
  );
}
