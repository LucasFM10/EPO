import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import PortalHome from "@/components/portal/PortalHome";

// Área restrita: não deve ser indexada por mecanismos de busca.
export const metadata: Metadata = {
  title: "Portal - EPO",
  robots: { index: false, follow: false },
};

// Verificação de sessão no servidor: o portal só é renderizado para usuários autenticados.
export default async function PortalPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <PortalHome />;
}
