import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import * as repo from "@/lib/server/repo";
import { MAX_PDF_BYTES, removeUpload, savePdf, uploadUrl, validatePdf } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";

/**
 * Anexa ou substitui o PDF de um fluxo. Exige sessão e origem igual ao host.
 * Corpo: o próprio arquivo PDF (Content-Type application/pdf).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Você precisa estar logado para alterar fluxos." }, { status: 401 });
  }

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "O PDF excede o tamanho máximo de 50 MB." }, { status: 413 });
  }

  const { id } = await params;
  if (!repo.flowExists(id)) return NextResponse.json({ error: "Fluxo não encontrado." }, { status: 404 });

  const data = Buffer.from(await req.arrayBuffer());
  const error = validatePdf(data);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const pdfUrl = uploadUrl(await savePdf(data));
  let obsolete: string[];
  try {
    obsolete = repo.updateFlowFiles(id, { pdfUrl });
  } catch (err) {
    await removeUpload(pdfUrl);
    throw err;
  }
  for (const url of obsolete) await removeUpload(url);
  return NextResponse.json({ ok: true, pdf_url: pdfUrl });
}
