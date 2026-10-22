"use client";

import React, { useState, useRef } from "react";
import { Upload, Loader2, X, FolderOpen, FileText, Check } from "lucide-react";
import type { FolderTreeNode } from "@/lib/types";

interface ImportFlowDialogProps {
  open: boolean;
  onClose: () => void;
  tree: FolderTreeNode[];
  onCreated: () => void;
}

interface ParsedDiagram {
  name: string;
  svgFileName: string;
  svgFile: File | null;
  pageData: Record<string, unknown>;
  selected: boolean;
}

/**
 * Parses a Bizagi configuration.json.js file content into JSON.
 */
function parseBizagiConfig(text: string): Record<string, unknown> {
  // Strip JS prefix like "Bizagi.AppModel = "
  const prefixMatch = text.match(/^\s*[\w.]+\s*=\s*/);
  if (prefixMatch) {
    text = text.slice(prefixMatch[0].length);
  }
  // Remove trailing semicolons/whitespace
  text = text.replace(/;\s*$/, "").trim();
  return JSON.parse(text);
}

export default function ImportFlowDialog({ open, onClose, tree, onCreated }: ImportFlowDialogProps) {
  const [folderId, setFolderId] = useState<string>("");
  const [diagrams, setDiagrams] = useState<ParsedDiagram[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flatten folders for the select dropdown
  const flattenFolders = (nodes: FolderTreeNode[], depth = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ id: node.folder.id, name: node.folder.name, depth });
      result.push(...flattenFolders(node.children, depth + 1));
    }
    return result;
  };

  const folders = flattenFolders(tree);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsing(true);
    setError(null);
    setDiagrams([]);

    try {
      // Find the config file (configuration.json.js or similar)
      let configFile: File | null = null;
      const svgFiles = new Map<string, File>();

      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase();
        const path = file.webkitRelativePath.toLowerCase();

        // Find the config file
        if (name.endsWith(".json.js") || name === "configuration.json") {
          configFile = file;
        }

        // Collect SVG files from the diagrams folder
        if (name.endsWith(".svg") && (path.includes("/diagrams/") || path.includes("\\diagrams\\"))) {
          svgFiles.set(name, file);
        }
      }

      if (!configFile) {
        setError("Nenhum arquivo configuration.json.js encontrado na pasta selecionada.");
        setParsing(false);
        return;
      }

      // Extract folder name from the first file's path
      const firstPath = Array.from(files)[0].webkitRelativePath;
      setFolderName(firstPath.split("/")[0] || firstPath.split("\\")[0] || "Pasta");

      // Parse the config
      const configText = await configFile.text();
      let config: Record<string, unknown>;
      try {
        config = parseBizagiConfig(configText);
      } catch {
        setError("Não foi possível interpretar o arquivo de configuração.");
        setParsing(false);
        return;
      }

      // Extract pages/diagrams
      const pages = (config as any).pages || [];
      if (pages.length === 0) {
        setError("Nenhum diagrama encontrado no arquivo de configuração.");
        setParsing(false);
        return;
      }

      const parsed: ParsedDiagram[] = pages.map((page: any) => {
        // Extract SVG filename from the page image path
        const imagePath: string = page.image || "";
        const svgFileName = imagePath.split("\\").pop()?.split("/").pop() || "";

        // Try to match with uploaded SVG files
        const matchedSvg = svgFiles.get(svgFileName.toLowerCase()) || null;

        return {
          name: page.name || "Sem nome",
          svgFileName,
          svgFile: matchedSvg,
          pageData: {
            ...config,
            pages: [page], // Only this page's data
          },
          selected: true, // Selected by default
        };
      });

      setDiagrams(parsed);
    } catch (err: any) {
      setError(err.message || "Erro ao processar a pasta");
    } finally {
      setParsing(false);
    }
  };

  const toggleDiagram = (index: number) => {
    setDiagrams((prev) =>
      prev.map((d, i) => (i === index ? { ...d, selected: !d.selected } : d))
    );
  };

  const selectAll = () => setDiagrams((prev) => prev.map((d) => ({ ...d, selected: true })));
  const selectNone = () => setDiagrams((prev) => prev.map((d) => ({ ...d, selected: false })));

  const selectedCount = diagrams.filter((d) => d.selected).length;

  const handleImport = async () => {
    if (!folderId || selectedCount === 0) return;

    setLoading(true);
    setError(null);

    try {
      const { createFlow } = await import("@/lib/mutations");
      const selected = diagrams.filter((d) => d.selected);

      for (const diagram of selected) {
        const svgContent = diagram.svgFile ? await diagram.svgFile.text() : null;
        await createFlow(folderId, diagram.name, diagram.pageData, svgContent);
      }

      // Reset state
      setDiagrams([]);
      setFolderId("");
      setFolderName(null);
      if (inputRef.current) inputRef.current.value = "";
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erro ao importar fluxos");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDiagrams([]);
    setFolderId("");
    setFolderName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={handleClose} />
      <div className="relative bg-white border border-black p-6 w-full max-w-lg shadow-none max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6 border-b border-black pb-4">
          <h2 className="text-xl font-bold text-black uppercase tracking-tight">Importar Fluxos (Bizagi)</h2>
          <button onClick={handleClose} className="text-black hover:bg-gray-100 p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 flex-1 overflow-hidden flex flex-col">
          {error && (
            <div className="p-3 bg-white border border-black text-xs font-bold text-black uppercase tracking-tight">{error}</div>
          )}

          {/* Folder picker */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Pasta do Bizagi (exportação)</label>
            <div className="relative">
              <input
                ref={inputRef}
                type="file"
                /* @ts-expect-error webkitdirectory is valid but not in React types */
                webkitdirectory=""
                directory=""
                onChange={handleFolderSelect}
                className="w-full text-xs text-black file:mr-3 file:py-2 file:px-4 file:border file:border-black file:text-[10px] file:font-black file:uppercase file:bg-white file:text-black hover:file:bg-black hover:file:text-white file:cursor-pointer file:transition-colors"
              />
            </div>
            {folderName && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                <FolderOpen className="w-3 h-3" />
                <span>{folderName}</span>
              </div>
            )}
          </div>

          {/* Destination folder */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Pasta de destino</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-black rounded-none text-xs text-black font-medium focus:outline-none focus:ring-0 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1rem' }}
            >
              <option value="">Selecione uma pasta...</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {"  ".repeat(f.depth)} {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Loading spinner for parsing */}
          {parsing && (
            <div className="flex items-center justify-center gap-2 py-4 border border-black border-dashed">
              <Loader2 className="w-4 h-4 animate-spin text-black" />
              <span className="text-[10px] font-black uppercase tracking-widest">Processando pasta...</span>
            </div>
          )}

          {/* Diagram list with checkboxes */}
          {diagrams.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Diagramas encontrados ({selectedCount}/{diagrams.length})
                </span>
                <div className="flex gap-3 text-[10px] font-black uppercase tracking-widest">
                  <button onClick={selectAll} className="text-black hover:underline">
                    Todos
                  </button>
                  <button onClick={selectNone} className="text-gray-400 hover:text-black">
                    Nenhum
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-px border border-black p-1 bg-gray-50">
                {diagrams.map((d, i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border ${
                      d.selected ? "bg-black border-black text-white" : "hover:bg-white border-transparent text-black"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${
                        d.selected
                          ? "bg-white border-white"
                          : "border-black bg-white"
                      }`}
                    >
                      {d.selected && <Check className="w-3 h-3 text-black" />}
                    </div>
                    <FileText className={`w-4 h-4 shrink-0 ${d.selected ? "text-white" : "text-black"}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] truncate font-bold uppercase tracking-tight`}>
                        {d.name}
                      </div>
                      <div className={`text-[9px] truncate uppercase tracking-tighter ${d.selected ? "text-gray-400" : "text-gray-500"}`}>
                        {d.svgFile ? `✓ SVG PRONTO` : `⚠ SVG AUSENTE`}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={d.selected}
                      onChange={() => toggleDiagram(i)}
                      className="sr-only"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t border-black">
            <button type="button" onClick={handleClose} className="flex-1 px-4 py-3 bg-white border border-black text-black text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={loading || selectedCount === 0 || !folderId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-black border border-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-gray-900 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar {selectedCount > 0 ? `(${selectedCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
