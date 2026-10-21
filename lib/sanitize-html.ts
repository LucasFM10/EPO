/**
 * Sanitização de HTML das descrições do Bizagi, feita no navegador com DOMParser.
 * Remove elementos ativos e atributos de evento, e bloqueia URLs javascript:/vbscript:.
 * Usado apenas em código cliente (o modal de detalhes), por isso não depende de bibliotecas.
 */
const DROP_ELEMENTS = [
  "script", "style", "iframe", "frame", "frameset", "object", "embed",
  "applet", "link", "meta", "base", "form", "input", "button", "textarea", "select",
];

const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "srcset"]);

function isUnsafeUrl(value: string): boolean {
  const normalized = value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
  return normalized.startsWith("javascript:") || normalized.startsWith("vbscript:");
}

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;

  body.querySelectorAll(DROP_ELEMENTS.join(",")).forEach((el) => el.remove());

  body.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.has(name) && isUnsafeUrl(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return body.innerHTML;
}
