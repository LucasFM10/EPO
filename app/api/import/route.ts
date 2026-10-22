import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { importExportZip, ImportError, MAX_IMPORT_BYTES } from "@/lib/server/backup-import";

export const dynamic = "force-dynamic";

/**
 * Substitui todas as pastas e fluxos pelos do .zip exportado.
 * Exige sessão, origem igual ao host e o cabeçalho X-Epo-Confirm: substituir.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }

  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Você precisa estar logado para importar." }, { status: 401 });
  }

  if (req.headers.get("x-epo-confirm") !== "substituir") {
    return NextResponse.json(
      { error: "Confirmação ausente. A importação substitui todos os dados." },
      { status: 400 }
    );
  }

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "O arquivo excede o tamanho máximo de 200 MB." }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await req.arrayBuffer());
    const report = await importExportZip(buffer);
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[import] erro inesperado:", err);
    return NextResponse.json({ error: "Erro inesperado ao importar." }, { status: 500 });
  }
}
