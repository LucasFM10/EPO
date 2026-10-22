import { MAX_SVG_BYTES } from "./config";

/**
 * Valida um SVG enviado pelo administrador antes de armazená-lo.
 * Rejeita conteúdo ativo (scripts, iframes, handlers, entidades externas).
 * O SVG é exibido apenas como imagem de fundo CSS, então scripts não executariam,
 * mas a rejeição evita armazenar e servir conteúdo perigoso.
 */
const ACTIVE_CONTENT = [
  /<\s*script/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
  /<!ENTITY/i,
  /\son[a-z]+\s*=/i,
  /(href|src)\s*=\s*["']?\s*javascript:/i,
  /(href|src)\s*=\s*["']?\s*data:text\/html/i,
];

export function validateSvg(content: string): string | null {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes === 0) return "O arquivo SVG está vazio.";
  if (bytes > MAX_SVG_BYTES) return "O arquivo SVG excede o tamanho máximo de 10 MB.";
  if (!/<svg[\s>]/i.test(content)) return "O arquivo não é um SVG válido.";
  if (ACTIVE_CONTENT.some((re) => re.test(content))) {
    return "O SVG contém elementos ativos não permitidos (script, iframe, handlers ou links javascript:).";
  }
  return null;
}
