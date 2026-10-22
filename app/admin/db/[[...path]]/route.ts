import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Proxy protegido para o sqlite-web (administração do banco).
 *
 * O sqlite-web não tem login próprio, então ele NÃO é publicado: fica só na rede interna do Docker
 * (serviço "sqlite-web", sem portas no host). Esta rota exige sessão válida em toda requisição
 * e só encaminha para esse endereço interno. Quem não está logado é mandado para /login.
 */
const UPSTREAM = (process.env.SQLITE_WEB_URL || "http://sqlite-web:8080").replace(/\/$/, "");

// Cabeçalhos que não devem atravessar o proxy.
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "host", "cookie", "set-cookie", "content-length", "content-encoding",
]);

async function proxy(req: NextRequest) {
  if (!(await getSessionUser())) {
    // Location relativo: a URL absoluta sairia com o endereço de bind (0.0.0.0) atrás do proxy.
    return new NextResponse(null, { status: 307, headers: { Location: "/login" } });
  }

  // Requisições que alteram estado (formulários do sqlite-web) só passam de mesma origem.
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  // O sqlite-web só responde na raiz com barra final ("/admin/db/"). Sem a barra ele redireciona,
  // e o Next remove a barra antes da rota: sem este ajuste os dois redirecionamentos entram em loop.
  const pathname = url.pathname === "/admin/db" ? "/admin/db/" : url.pathname;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}${pathname}${url.search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return new NextResponse("Serviço de administração do banco indisponível.", { status: 502 });
  }

  const out = new Headers();
  for (const name of ["content-type", "content-disposition", "location", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // Redirecionamentos do sqlite-web apontam para o endereço interno: troca por caminho relativo.
  const location = out.get("location");
  if (location) out.set("location", location.replace(UPSTREAM, ""));
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Referrer-Policy", "same-origin");

  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as HEAD };
