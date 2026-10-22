import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { buildExportZip } from "@/lib/server/backup-export";

export const dynamic = "force-dynamic";

/** Baixa todas as pastas e fluxos em .zip. Exige sessão. */
export async function GET() {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Você precisa estar logado para exportar." }, { status: 401 });
  }

  const { buffer, fileName } = await buildExportZip();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
