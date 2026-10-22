"use client";

import React, { useState } from "react";
import { Upload, Loader2, X, FolderOpen, FileText, Check, AlertTriangle, Archive } from "lucide-react";
import type { Flow } from "@/lib/types";

/**
 * Destino da importação:
 * - folder: cria um fluxo por página marcada dentro da pasta (botão direito na pasta).
 * - flow: preenche um fluxo existente com uma página (botão direito no fluxo).
 */
export type ImportTarget =
  | { kind: "folder"; folderId: string; folderName: string; existingTitles: string[] }
  | { kind: "flow"; flow: Flow };

interface ImportFlowDialogProps {
  open: boolean;
  target: ImportTarget | null;
  onClose: () => void;
  onDone: () => void;
}

/** Um arquivo da exportação, com leitura sob demanda (o zip só é lido quando necessário). */
interface Entry {
  path: string;
  read: () => Promise<string>;
}

interface Diagram {
  name: string;
  svgName: string;
  svg: Entry | null;
  pageData: Record<string, unknown>;
  selected: boolean;
}

const normalize = (text: string) => text.trim().toLowerCase();
const baseName = (path: string) => path.split(/[\\/]/).pop() || "";

/** Remove o prefixo JS ("Bizagi.AppModel = ") e interpreta o JSON. Não executa o arquivo. */
function parseBizagiConfig(text: string): Record<string, unknown> {
  const prefix = text.match(/^\s*[\w.]+\s*=\s*/);
  if (prefix) text = text.slice(prefix[0].length);
  text = text.replace(/;\s*$/, "").trim();
  return JSON.parse(text);
}

/**
 * Localiza o modelo. A exportação do Bizagi tem também um key.json.js (configurações de publicação),
 * que NÃO é o modelo: por isso só aceitamos arquivos cujo nome começa com "configuration".
 * Prefere o caminho padrão libs/js/json/.
 */
function findConfig(entries: Entry[]): Entry | null {
  const candidates = entries.filter((e) => /(^|\/)configuration\.json(\.js)?$/i.test(e.path));
  return candidates.find((e) => /libs\/js\/json\//i.test(e.path)) ?? candidates[0] ?? null;
}

async function entriesFromFolder(files: FileList): Promise<Entry[]> {
  return Array.from(files).map((file) => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    read: () => file.text(),
  }));
}

async function entriesFromZip(file: File): Promise<Entry[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const out: Entry[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir) out.push({ path, read: () => entry.async("string") });
  });
  return out;
}

async function buildDiagrams(entries: Entry[]): Promise<{ diagrams: Diagram[]; modelName: string }> {
  const config = findConfig(entries);
  if (!config) {
    throw new Error(
      "Nenhum arquivo de configuração do Bizagi encontrado (configuration.json.js). Use a exportação completa, com a pasta libs/js/json."
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseBizagiConfig(await config.read());
  } catch {
    throw new Error("Não foi possível interpretar o arquivo de configuração do Bizagi.");
  }

  const pages = (parsed.pages as Record<string, unknown>[] | undefined) ?? [];
  if (pages.length === 0) throw new Error("Nenhum diagrama encontrado no arquivo de configuração.");

  // SVGs da pasta diagrams/, indexados pelo nome do arquivo (sem diferenciar maiúsculas).
  const svgs = new Map<string, Entry>();
  for (const e of entries) {
    if (/(^|\/)diagrams\//i.test(e.path) && /\.svg$/i.test(e.path)) svgs.set(baseName(e.path).toLowerCase(), e);
  }

  const diagrams = pages.map((page): Diagram => {
    const svgName = baseName(String(page.image || ""));
    return {
      name: String(page.name || "Sem nome").trim(),
      svgName,
      svg: svgs.get(svgName.toLowerCase()) ?? null,
      pageData: { ...parsed, pages: [page] },
      selected: true,
    };
  });

  return { diagrams, modelName: String(parsed.modelName || "") };
}

export default function ImportFlowDialog({ open, target, onClose, onDone }: ImportFlowDialogProps) {
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [chosenIndex, setChosenIndex] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !target) return null;

  const reset = () => {
    setDiagrams([]);
    setSourceLabel(null);
    setChosenIndex(0);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const loadEntries = async (entries: Promise<Entry[]>, label: string) => {
    setParsing(true);
    setError(null);
    setDiagrams([]);
    try {
      const { diagrams: parsed } = await buildDiagrams(await entries);
      setDiagrams(parsed);
      setSourceLabel(label);
      setChosenIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler a exportação do Bizagi.");
    } finally {
      setParsing(false);
    }
  };

  const onFolderChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const root = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "pasta";
    loadEntries(entriesFromFolder(files), `Pasta: ${root}`);
    e.target.value = "";
  };

  const onZipChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadEntries(entriesFromZip(file), `Arquivo: ${file.name}`);
    e.target.value = "";
  };

  const toggle = (i: number) =>
    setDiagrams((prev) => prev.map((d, j) => (j === i ? { ...d, selected: !d.selected } : d)));
  const rename = (i: number, name: string) =>
    setDiagrams((prev) => prev.map((d, j) => (j === i ? { ...d, name } : d)));
  const setAll = (selected: boolean) => setDiagrams((prev) => prev.map((d) => ({ ...d, selected })));

  // Nomes que já existem na pasta, ou repetidos entre os itens marcados, impedem a importação.
  const existing = new Set(target.kind === "folder" ? target.existingTitles.map(normalize) : []);
  const selectedNames = diagrams.filter((d) => d.selected).map((d) => normalize(d.name));
  const conflictOf = (d: Diagram): string | null => {
    const key = normalize(d.name);
    if (!key) return "Informe um nome";
    if (existing.has(key)) return "Já existe um fluxo com este nome nesta pasta";
    if (selectedNames.filter((n) => n === key).length > 1) return "Nome repetido entre os selecionados";
    return null;
  };

  const selectedCount = diagrams.filter((d) => d.selected).length;
  const hasConflicts = diagrams.some((d) => d.selected && conflictOf(d) !== null);
  const chosen = diagrams[chosenIndex];

  const handleImport = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (target.kind === "folder") {
        const items = await Promise.all(
          diagrams
            .filter((d) => d.selected)
            .map(async (d) => ({
              title: d.name.trim(),
              bizagiJson: d.pageData,
              svgContent: d.svg ? await d.svg.read() : null,
            }))
        );
        const { createFlowsBatch } = await import("@/lib/mutations");
        await createFlowsBatch(target.folderId, items);
      } else {
        if (!chosen?.svg) throw new Error("A página escolhida não tem o SVG correspondente.");
        const { attachBizagi } = await import("@/lib/mutations");
        await attachBizagi(target.flow.id, chosen.pageData, await chosen.svg.read());
      }
      reset();
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setSubmitting(false);
    }
  };

  const canImport =
    !submitting &&
    !parsing &&
    (target.kind === "folder" ? selectedCount > 0 && !hasConflicts : !!chosen?.svg);

  const title = target.kind === "folder" ? `Importar Bizagi em "${target.folderName}"` : `Importar Bizagi em "${target.flow.title}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={handleClose} />
      <div className="relative bg-white border border-black p-6 w-full max-w-lg text-black max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-5 border-b border-black pb-4">
          <h2 className="text-lg font-bold uppercase tracking-tight pr-4">{title}</h2>
          <button onClick={handleClose} className="hover:bg-gray-100 p-1 transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 flex-1 min-h-0 flex flex-col">
          {error && (
            <div className="p-3 bg-white border border-black text-xs font-bold uppercase tracking-tight">{error}</div>
          )}

          {/* Origem */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
              Exportação do Bizagi (pasta ou .zip)
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-black text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-gray-100">
                <FolderOpen className="w-4 h-4" /> Escolher pasta
                <input
                  type="file"
                  /* @ts-expect-error webkitdirectory is valid but not in React types */
                  webkitdirectory=""
                  directory=""
                  onChange={onFolderChosen}
                  className="hidden"
                />
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-black text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-gray-100">
                <Archive className="w-4 h-4" /> Escolher .zip
                <input type="file" accept=".zip,application/zip" onChange={onZipChosen} className="hidden" />
              </label>
            </div>
            {sourceLabel && (
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">{sourceLabel}</div>
            )}
            {parsing && (
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <Loader2 className="w-4 h-4 animate-spin" /> Lendo exportação...
              </div>
            )}
          </div>

          {/* Aviso para importação em fluxo existente */}
          {target.kind === "flow" && target.flow.svg_url && diagrams.length > 0 && (
            <div className="flex gap-2 p-3 border border-black text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                O SVG atual deste fluxo será substituído e os itens clicáveis anteriores serão removidos. O PDF não é afetado.
              </span>
            </div>
          )}

          {/* Lista de páginas */}
          {diagrams.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  {target.kind === "folder"
                    ? `Diagramas (${selectedCount}/${diagrams.length})`
                    : "Escolha a página"}
                </span>
                {target.kind === "folder" && (
                  <div className="flex gap-3 text-[10px] font-black uppercase tracking-widest">
                    <button onClick={() => setAll(true)} className="hover:underline">Todos</button>
                    <button onClick={() => setAll(false)} className="text-gray-400 hover:text-black">Nenhum</button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto border border-black p-1 bg-gray-50 space-y-px">
                {diagrams.map((d, i) => {
                  const conflict = target.kind === "folder" && d.selected ? conflictOf(d) : null;
                  const picked = target.kind === "flow" ? chosenIndex === i : d.selected;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-3 py-2 border ${
                        picked ? "bg-black border-black text-white" : "bg-white border-transparent text-black"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => (target.kind === "flow" ? setChosenIndex(i) : toggle(i))}
                        aria-label={target.kind === "flow" ? "Escolher página" : "Incluir na importação"}
                        className={`mt-0.5 w-4 h-4 border flex items-center justify-center shrink-0 ${
                          target.kind === "flow" ? "rounded-full" : ""
                        } ${picked ? "bg-white border-white" : "border-black bg-white"}`}
                      >
                        {picked && <Check className="w-3 h-3 text-black" />}
                      </button>
                      <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${picked ? "text-white" : "text-black"}`} />
                      <div className="flex-1 min-w-0 space-y-1">
                        {target.kind === "folder" ? (
                          <input
                            value={d.name}
                            onChange={(e) => rename(i, e.target.value)}
                            className={`w-full px-2 py-1 text-[11px] font-bold uppercase tracking-tight border ${
                              conflict ? "border-red-600 text-red-600" : "border-black text-black"
                            } bg-white focus:outline-none`}
                          />
                        ) : (
                          <div className="text-[11px] font-bold uppercase tracking-tight truncate">{d.name}</div>
                        )}
                        <div className={`text-[9px] uppercase tracking-tighter ${picked ? "text-gray-300" : "text-gray-500"}`}>
                          {conflict ? conflict : d.svg ? "SVG pronto" : "SVG ausente: o fluxo ficará sem diagrama"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-black">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-white border border-black text-[10px] font-black uppercase tracking-widest hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-black border border-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-gray-900"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {target.kind === "folder"
                ? `Importar${selectedCount > 0 ? ` (${selectedCount})` : ""}`
                : "Substituir SVG e Bizagi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
