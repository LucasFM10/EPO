"use client";

import React, { useState } from "react";
import { Loader2, X } from "lucide-react";
import { messageOf } from "@/lib/utils";

interface NewFlowDialogProps {
  open: boolean;
  folderName: string;
  folderId: string;
  /** Títulos já existentes na pasta: a checagem acontece antes de enviar, para mostrar a mensagem certa. */
  existingTitles: string[];
  onClose: () => void;
  onCreated: () => void;
}

/** Cria um fluxo vazio (sem SVG, PDF nem Bizagi) na pasta informada. Os arquivos são anexados depois. */
export default function NewFlowDialog({ open, folderName, folderId, existingTitles, onClose, onCreated }: NewFlowDialogProps) {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (existingTitles.some((t) => t.trim().toLowerCase() === title.trim().toLowerCase())) {
      setError("Já existe um fluxo com este nome nesta pasta. Escolha outro nome.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { createFlow } = await import("@/lib/mutations");
      await createFlow(folderId, title.trim(), null, null);
      setTitle("");
      onCreated();
      onClose();
    } catch (err) {
      setError(messageOf(err) || "Erro ao criar fluxo");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative bg-white border border-black p-6 w-full max-w-md text-black">
        <div className="flex items-center justify-between mb-6 border-b border-black pb-4">
          <h2 className="text-xl font-bold uppercase tracking-tight">Novo fluxo</h2>
          <button onClick={onClose} className="hover:bg-gray-100 p-1 transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-white border border-black text-xs font-bold uppercase tracking-tight">{error}</div>
          )}

          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
              Título do fluxo (em &quot;{folderName}&quot;)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-white border border-black text-sm focus:outline-none"
            />
            <p className="text-[10px] text-gray-500 uppercase tracking-tight">
              O fluxo será criado vazio. Depois, clique com o botão direito nele para anexar SVG, PDF ou importar Bizagi.
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-black">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-white border border-black text-[10px] font-black uppercase tracking-widest hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-black border border-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-gray-900"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
