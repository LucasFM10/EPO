"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { FolderOpen, FileText, ChevronRight, ChevronDown, Loader2, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/utils";
import {
  renameFolder,
  renameFlow,
  deleteFolder,
  deleteFlow,
  moveFolder,
  moveFlow,
  removeSvg,
  removePdf,
} from "@/lib/mutations";
import ContextMenu, { ContextMenuItem } from "@/components/ContextMenu";
import type { FolderTreeNode, Flow } from "@/lib/types";

/** Ações que a barra lateral pede ao portal (que abre o diálogo ou o seletor de arquivo). */
export type SidebarAction =
  | { type: "newFolder"; parentId: string | null }
  | { type: "newFlow"; folderId: string }
  | { type: "importFolder"; folderId: string; folderName: string }
  | { type: "importFlow"; flow: Flow }
  | { type: "attach"; flow: Flow; fileKind: "svg" | "pdf" };

interface SidebarProps {
  tree: FolderTreeNode[];
  loading: boolean;
  selectedFlowId: string | null;
  onSelectFlow: (flow: Flow) => void;
  onAction: (action: SidebarAction) => void;
  onDataChanged: () => void;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

type OpenMenu = (x: number, y: number, items: ContextMenuItem[]) => void;

/* ─── Inline rename input ─── */
function InlineRename({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
      className="text-sm bg-white border border-black px-1.5 py-0.5 text-black outline-none w-full"
    />
  );
}

/* ─── Botão de três pontos: abre o mesmo menu do clique direito ─── */
function MoreButton({ onOpen }: { onOpen: (x: number, y: number) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
      aria-label="Ações"
      className="p-1 border border-transparent hover:border-black text-gray-500 hover:text-black transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      <MoreHorizontal className="w-3.5 h-3.5" />
    </button>
  );
}

/* ─── Folder item ─── */
function FolderItem({
  node,
  selectedFlowId,
  onSelectFlow,
  onDataChanged,
  onAction,
  onOpenMenu,
  isAdmin,
  depth = 0,
}: {
  node: FolderTreeNode;
  selectedFlowId: string | null;
  onSelectFlow: (flow: Flow) => void;
  onDataChanged: () => void;
  onAction: (action: SidebarAction) => void;
  onOpenMenu: OpenMenu;
  isAdmin: boolean;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renamingFlowId, setRenamingFlowId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const hasChildren = node.children.length > 0 || node.flows.length > 0;

  const handleRenameFolder = async (newName: string) => {
    try { await renameFolder(node.folder.id, newName); onDataChanged(); } catch (e) { alert(messageOf(e)); }
    setRenaming(false);
  };

  const handleDeleteFolder = async () => {
    if (!confirm(`Excluir a pasta "${node.folder.name}" e todo seu conteúdo?`)) return;
    try { await deleteFolder(node.folder.id); onDataChanged(); } catch (e) { alert(messageOf(e)); }
  };

  const handleRenameFlow = async (flowId: string, newTitle: string) => {
    try { await renameFlow(flowId, newTitle); onDataChanged(); } catch (e) { alert(messageOf(e)); }
    setRenamingFlowId(null);
  };

  const handleDeleteFlow = async (flow: Flow) => {
    if (!confirm(`Excluir o fluxo "${flow.title}"?`)) return;
    try { await deleteFlow(flow.id); onDataChanged(); } catch (e) { alert(messageOf(e)); }
  };

  const handleRemoveFile = async (flow: Flow, fileKind: "svg" | "pdf") => {
    const label = fileKind === "svg" ? "SVG" : "PDF";
    const extra = fileKind === "svg" ? " Se houver itens clicáveis do Bizagi, eles também serão removidos." : "";
    if (!confirm(`Remover o ${label} do fluxo "${flow.title}"?${extra}`)) return;
    try {
      if (fileKind === "svg") await removeSvg(flow.id);
      else await removePdf(flow.id);
      onDataChanged();
    } catch (e) { alert(messageOf(e)); }
  };

  const folderMenu = (): ContextMenuItem[] => [
    { label: "Novo fluxo vazio", onSelect: () => onAction({ type: "newFlow", folderId: node.folder.id }) },
    { label: "Nova subpasta", onSelect: () => onAction({ type: "newFolder", parentId: node.folder.id }) },
    { label: "Importar Bizagi aqui", onSelect: () => onAction({ type: "importFolder", folderId: node.folder.id, folderName: node.folder.name }) },
    { label: "Renomear", onSelect: () => setRenaming(true), separatorBefore: true },
    { label: "Excluir", onSelect: handleDeleteFolder, danger: true },
  ];

  const flowMenu = (flow: Flow): ContextMenuItem[] => [
    { label: "Renomear", onSelect: () => setRenamingFlowId(flow.id) },
    { label: flow.svg_url ? "Trocar SVG" : "Anexar SVG", onSelect: () => onAction({ type: "attach", flow, fileKind: "svg" }), separatorBefore: true },
    { label: flow.pdf_url ? "Trocar PDF" : "Anexar PDF", onSelect: () => onAction({ type: "attach", flow, fileKind: "pdf" }) },
    { label: "Importar Bizagi neste fluxo", onSelect: () => onAction({ type: "importFlow", flow }) },
    ...(flow.svg_url ? [{ label: "Remover SVG", onSelect: () => handleRemoveFile(flow, "svg") }] : []),
    ...(flow.pdf_url ? [{ label: "Remover PDF", onSelect: () => handleRemoveFile(flow, "pdf") }] : []),
    { label: "Excluir", onSelect: () => handleDeleteFlow(flow), danger: true, separatorBefore: true },
  ];

  const handleDragStart = (e: React.DragEvent, id: string, type: 'folder' | 'flow') => {
    if (!isAdmin) return;
    e.dataTransfer.setData("id", id);
    e.dataTransfer.setData("type", type);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    if (!isAdmin) return;

    const draggedId = e.dataTransfer.getData("id");
    const draggedType = e.dataTransfer.getData("type");

    if (!draggedId || !draggedType) return;
    if (draggedId === targetFolderId) return;

    try {
      if (draggedType === 'folder') {
        await moveFolder(draggedId, targetFolderId);
      } else {
        await moveFlow(draggedId, targetFolderId);
      }
      onDataChanged();
    } catch (err) {
      alert(messageOf(err));
    } finally {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };

  return (
    <li>
      <div
        draggable={isAdmin && !renaming}
        onDragStart={(e) => handleDragStart(e, node.folder.id, 'folder')}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!isAdmin) return;
          dragCounter.current++;
          if (dragCounter.current === 1) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragCounter.current--;
          if (dragCounter.current === 0) setIsDragOver(false);
        }}
        onDrop={(e) => handleDrop(e, node.folder.id)}
        onContextMenu={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          e.stopPropagation();
          onOpenMenu(e.clientX, e.clientY, folderMenu());
        }}
        className={`group w-full flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors ${
          isDragOver ? "bg-black text-white" : "hover:bg-gray-100 text-black"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button onClick={() => setOpen(!open)} className={`flex items-center gap-2 flex-1 min-w-0 text-left ${isDragOver ? "pointer-events-none" : ""}`}>
          {hasChildren ? (
            open ? <ChevronDown className={`w-3 h-3 shrink-0 ${isDragOver ? "text-white" : "text-black"}`} /> : <ChevronRight className={`w-3 h-3 shrink-0 ${isDragOver ? "text-white" : "text-black"}`} />
          ) : (
            <span className="w-3" />
          )}
          <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isDragOver ? "text-white" : "text-gray-500"}`} />
          {renaming ? (
            <InlineRename value={node.folder.name} onSave={handleRenameFolder} onCancel={() => setRenaming(false)} />
          ) : (
            <span className={`text-[13px] font-bold uppercase tracking-tight ${isDragOver ? "text-white" : "text-black"}`}>{node.folder.name}</span>
          )}
        </button>
        {isAdmin && !renaming && (
          <MoreButton onOpen={(x, y) => onOpenMenu(x, y, folderMenu())} />
        )}
      </div>

      {open && hasChildren && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <FolderItem
              key={child.folder.id}
              node={child}
              selectedFlowId={selectedFlowId}
              onSelectFlow={onSelectFlow}
              onDataChanged={onDataChanged}
              onAction={onAction}
              onOpenMenu={onOpenMenu}
              isAdmin={isAdmin}
              depth={depth + 1}
            />
          ))}
          {node.flows.map((flow) => (
            <li key={flow.id}>
              <div
                draggable={isAdmin && renamingFlowId !== flow.id}
                onDragStart={(e) => handleDragStart(e, flow.id, 'flow')}
                onContextMenu={(e) => {
                  if (!isAdmin) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenMenu(e.clientX, e.clientY, flowMenu(flow));
                }}
                className={`group w-full flex items-center gap-2 py-1 cursor-pointer transition-colors ${
                  selectedFlowId === flow.id
                    ? "bg-gray-200 border-l-2 border-black"
                    : "hover:bg-gray-100 text-gray-600"
                }`}
                style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
              >
                <button onClick={() => onSelectFlow(flow)} className="flex items-start gap-2 flex-1 min-w-0 text-left">
                  <span className="w-3 shrink-0" />
                  <FileText className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selectedFlowId === flow.id ? "text-black" : "text-gray-400"}`} />
                  {renamingFlowId === flow.id ? (
                    <InlineRename value={flow.title} onSave={(v) => handleRenameFlow(flow.id, v)} onCancel={() => setRenamingFlowId(null)} />
                  ) : (
                    <span className={`text-[12px] font-medium break-words ${selectedFlowId === flow.id ? "text-black font-bold" : ""}`}>{flow.title}</span>
                  )}
                </button>
                {isAdmin && renamingFlowId !== flow.id && (
                  <MoreButton onOpen={(x, y) => onOpenMenu(x, y, flowMenu(flow))} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Sidebar({ tree, loading, selectedFlowId, onSelectFlow, onAction, onDataChanged }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = !!user;
  const [menu, setMenu] = useState<MenuState | null>(null);

  const openMenu = useCallback<OpenMenu>((x, y, items) => setMenu({ x, y, items }), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Clique direito no espaço vazio da lista: ações da raiz.
  const handleBackgroundContext = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { label: "Nova pasta", onSelect: () => onAction({ type: "newFolder", parentId: null }) },
    ]);
  };

  return (
    <aside className="w-64 bg-white border-r border-black flex flex-col h-full text-black">
      <div className="p-4 flex-1 overflow-y-auto" onContextMenu={handleBackgroundContext}>
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
          Arquivos
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : tree.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2">
            Nenhum fluxo encontrado.
            {isAdmin && " Clique com o botão direito aqui para criar uma pasta."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {tree.map((node) => (
              <FolderItem
                key={node.folder.id}
                node={node}
                selectedFlowId={selectedFlowId}
                onSelectFlow={onSelectFlow}
                onDataChanged={onDataChanged}
                onAction={onAction}
                onOpenMenu={openMenu}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
        )}
      </div>

      {isAdmin && (
        <div className="p-4 border-t border-black bg-gray-50">
          <button
            onClick={() => onAction({ type: "newFolder", parentId: null })}
            className="w-full py-2 bg-white border border-black hover:bg-gray-100 text-black text-xs font-bold uppercase transition-colors"
          >
            + Nova Pasta
          </button>
          <p className="mt-2 text-[10px] text-gray-500 uppercase tracking-tight">
            Clique com o botão direito em pastas e fluxos para mais ações.
          </p>
        </div>
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      )}
    </aside>
  );
}
