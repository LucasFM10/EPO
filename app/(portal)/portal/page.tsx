import type { Metadata } from "next";
import PortalHome from "@/components/portal/PortalHome";

// Navegação pública: qualquer pessoa pode ver os processos. Edição exige login (ver components e lib/mutations.ts).
export const metadata: Metadata = {
  title: "Portal - EPO",
  robots: { index: false, follow: false },
};

export default function PortalPage() {
  return <PortalHome />;
}
