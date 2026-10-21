import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveUpload } from "@/lib/server/uploads";

/**
 * Serve SVGs enviados. Leitura pública (necessária para os diagramas incorporados).
 * O nome é validado contra um padrão UUID gerado pelo servidor (sem path traversal).
 * CSP restritiva: mesmo se aberto diretamente, o SVG não carrega scripts nem recursos externos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const full = resolveUpload(name);
  if (!full) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await fs.readFile(full);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
