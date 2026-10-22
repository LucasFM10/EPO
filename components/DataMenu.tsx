"use client";

import React, { useEffect, useRef, useState } from "react";

const CONFIRM_WORD = "SUBSTITUIR";

interface Preview {
  file: File;
  folders: number;
  flows: number;
  exportedAt: string | null;
}

/** Menu discreto com Exportar e Importar. Importar substitui todos os dados e exige confirmação. */
export default function DataMenu() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setOpen(false);
    if (!file) return;
    try {
      // Carregado sob demanda para não pesar no carregamento inicial da página.
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      const entry = zip.file("epo-export.json");
      if (!entry) throw new Error("O arquivo não contém epo-export.json.");
      const data = JSON.parse(await entry.async("string"));
      if (data.format !== "epo-export" || !Array.isArray(data.folders) || !Array.isArray(data.flows)) {
        throw new Error("Este arquivo não é uma exportação do EPO.");
      }
      setTyped("");
      setPreview({
        file,
        folders: data.folders.length,
        flows: data.flows.length,
        exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null,
      });
    } catch (err) {
      alert(`Arquivo inválido: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const confirmImport = async () => {
    if (!preview || typed !== CONFIRM_WORD) return;
    setBusy(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/zip", "X-Epo-Confirm": "substituir" },
        body: preview.file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao importar.");

      const lines = [
        "Importação concluída.",
        `Apagados: ${data.removed.folders} pastas e ${data.removed.flows} fluxos.`,
        `Importados: ${data.folders} pastas e ${data.flows} fluxos.`,
        `SVGs gravados: ${data.svgs.written}.`,
      ];
      if (data.svgs.invalid.length > 0) {
        lines.push(`SVGs ignorados (${data.svgs.invalid.length}):`, ...data.svgs.invalid.map((s: string) => `- ${s}`));
      }
      if (data.issues.length > 0) {
        lines.push(`Avisos (${data.issues.length}):`, ...data.issues.map((s: string) => `- ${s}`));
      }
      alert(lines.join("\n"));
      window.location.reload();
    } catch (err) {
      alert(`Falha ao importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      setPreview(null);
    }
  };

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="text-[11px] font-bold uppercase text-gray-400 hover:text-black"
        >
          Dados
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-56 border border-black bg-white text-black shadow-md z-50 text-[12px]"
          >
            <a
              role="menuitem"
              href="/api/export"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 font-bold uppercase hover:bg-gray-100"
            >
              Exportar .zip
            </a>
            <button
              role="menuitem"
              onClick={() => fileInput.current?.click()}
              className="block w-full text-left px-3 py-2 font-bold uppercase hover:bg-gray-100"
            >
              Importar .zip…
            </button>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={onFileChosen}
        />
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setPreview(null);
          }}
        >
          <div className="bg-white border border-black max-w-md w-full p-6 text-black">
            <h2 className="text-lg font-black uppercase mb-3">Substituir todos os dados?</h2>
            <p className="text-sm mb-3">
              Todas as pastas, fluxos e diagramas atuais serão <strong>apagados</strong> e recriados a partir de{" "}
              <strong>{preview.file.name}</strong>:
            </p>
            <ul className="text-sm mb-3 list-disc pl-5">
              <li>{preview.folders} pastas</li>
              <li>{preview.flows} fluxos</li>
              {preview.exportedAt && (
                <li>exportado em {new Date(preview.exportedAt).toLocaleString("pt-BR")}</li>
              )}
            </ul>
            <p className="text-sm mb-3">
              Usuários e logins não são afetados. Esta ação não pode ser desfeita. Se quiser guardar a situação
              atual, <a href="/api/export" className="underline">exporte um backup antes</a>.
            </p>
            <label htmlFor="confirm-word" className="block text-sm mb-1">
              Digite <strong>{CONFIRM_WORD}</strong> para confirmar
            </label>
            <input
              id="confirm-word"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full border border-black px-2 py-2 mb-4 text-sm"
            />
            <div className="flex justify-end items-center gap-4">
              <button
                onClick={() => setPreview(null)}
                disabled={busy}
                className="text-xs font-bold uppercase underline disabled:text-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={confirmImport}
                disabled={busy || typed !== CONFIRM_WORD}
                className="bg-black text-white px-4 py-2 text-xs font-bold uppercase disabled:bg-gray-300"
              >
                {busy ? "Substituindo..." : "Substituir tudo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
