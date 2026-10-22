import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/session";
import PortalHome from "@/components/portal/PortalHome";

// Verificação de sessão no servidor: o portal só é renderizado para usuários autenticados.
export default async function PortalPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <PortalHome />;
}
