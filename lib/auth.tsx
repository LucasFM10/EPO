"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { logout } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/server/session";

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * A sessão é resolvida no servidor (layout raiz) e entregue como `initialUser`.
 * Nenhuma credencial ou token é lido pelo navegador: o cookie é HttpOnly.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const signOut = async () => {
    setUser(null);
    await logout();
  };

  return (
    <AuthContext.Provider value={{ user, loading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
