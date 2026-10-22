import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { contentTypeFor, resolveUpload } from "@/lib/server/uploads";

/**
 * Serve SVGs e PDFs enviados. Leitura pública (necessária para a visualização e para o embed).
 * O nome é validado contra um padrão UUID gerado pelo servidor (sem path traversal).
 * CSP restritiva: mesmo se aberto diretamente, o arquivo não carrega scripts nem recursos externos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const full = resolveUpload(name);
  if (!full) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await fs.readFile(full);
    const isPdf = name.endsWith(".pdf");
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentTypeFor(name),
        "Content-Disposition": "inline",
        "Content-Security-Policy": isPdf
          ? "default-src 'none'; sandbox"
          : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
