"use client";

import React, { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { FolderTreeNode } from "@/lib/types";
import { messageOf } from "@/lib/utils";

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  tree: FolderTreeNode[];
  /** Pasta pai já escolhida (ex.: vinda do clique direito). null = raiz. */
  defaultParentId?: string | null;
  onCreated: () => void;
}

export default function CreateFolderDialog({ open, onClose, tree, defaultParentId = null, onCreated }: CreateFolderDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flattenFolders = (nodes: FolderTreeNode[], depth = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ id: node.folder.id, name: node.folder.name, depth });
      result.push(...flattenFolders(node.children, depth + 1));
    }
    return result;
  };

  const folders = flattenFolders(tree);

  // Nomes que já existem no nível escolhido: checados antes de enviar.
  const siblingsOf = (nodes: FolderTreeNode[], id: string | null): FolderTreeNode[] | null => {
    if (id === null) return nodes;
    for (const n of nodes) {
      if (n.folder.id === id) return n.children;
      const found = siblingsOf(n.children, id);
      if (found) return found;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const siblings = siblingsOf(tree, parentId || null) ?? [];
    if (siblings.some((n) => n.folder.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      setError("Já existe uma pasta com este nome neste nível. Escolha outro nome.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { createFolder } = await import("@/lib/mutations");
      await createFolder(name.trim(), parentId || null);
      setName("");
      onCreated();
      onClose();
    } catch (err) {
      setError(messageOf(err) || "Erro ao criar pasta");
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
          <h2 className="text-xl font-bold uppercase tracking-tight">Nova pasta</h2>
          <button onClick={onClose} className="hover:bg-gray-100 p-1 transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-white border border-black text-xs font-bold uppercase tracking-tight">{error}</div>
          )}

          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Nome da pasta</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-white border border-black text-sm focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Pasta pai</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-black text-sm focus:outline-none"
            >
              <option value="">Raiz (sem pasta pai)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {"— ".repeat(f.depth)}{f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4 border-t border-black">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-white border border-black text-[10px] font-black uppercase tracking-widest hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
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
