"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Sidebar, { SidebarAction } from "@/components/Sidebar";
import FlowViewer from "@/components/FlowViewer";
import CreateFolderDialog from "@/components/CreateFolderDialog";
import ImportFlowDialog, { ImportTarget } from "@/components/ImportFlowDialog";
import NewFlowDialog from "@/components/NewFlowDialog";
import { useAuth } from "@/lib/auth";
import { getFolderTree, getFlowByIdOrSlug, getFolderBreadcrumb } from "@/lib/queries";
import { attachSvg } from "@/lib/mutations";
import type { FolderTreeNode, Flow, Folder } from "@/lib/types";

type FolderDialog = { open: boolean; parentId: string | null };
type NewFlowDialogState = { folderId: string; folderName: string } | null;

/** Procura uma pasta na árvore pelo id. */
function findNode(nodes: FolderTreeNode[], id: string): FolderTreeNode | null {
  for (const node of nodes) {
    if (node.folder.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export default function PortalHome() {
  const { user } = useAuth();
  const isAdmin = !!user;
  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [localLoading, setLocalLoading] = useState(true);

  // Diálogos e seletor de arquivo acionados pelo menu de contexto
  const [folderDialog, setFolderDialog] = useState<FolderDialog>({ open: false, parentId: null });
  const [newFlowDialog, setNewFlowDialog] = useState<NewFlowDialogState>(null);
  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const pendingAttach = useRef<{ flow: Flow; fileKind: "svg" | "pdf" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [attachKind, setAttachKind] = useState<"svg" | "pdf">("svg");

  // Carrega a árvore de pastas e fluxos (leitura pública)
  const loadTree = useCallback(async () => {
    try {
      const data = await getFolderTree();
      setTree(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadTree().finally(() => setLocalLoading(false));
  }, [loadTree]);

  // Ao escolher um fluxo na lista, busca os dados completos (diagrama, PDF, Bizagi)
  const handleSelectFlow = useCallback(async (flow: Flow) => {
    const fullFlow = await getFlowByIdOrSlug(flow.slug);
    if (fullFlow) {
      setSelectedFlow(fullFlow);
      const crumbs = await getFolderBreadcrumb(fullFlow.folder_id);
      setBreadcrumbs(crumbs);
    }
  }, []);

  // Depois de qualquer alteração: recarrega a árvore e o fluxo aberto (se ainda existir)
  const selectedRef = useRef<Flow | null>(null);
  selectedRef.current = selectedFlow;

  const handleDataChanged = useCallback(async () => {
    await loadTree();
    const current = selectedRef.current;
    if (!current) return;
    const fresh = await getFlowByIdOrSlug(current.slug);
    setSelectedFlow(fresh);
    setBreadcrumbs(fresh ? await getFolderBreadcrumb(fresh.folder_id) : []);
  }, [loadTree]);

  const handleAction = useCallback(
    async (action: SidebarAction) => {
      switch (action.type) {
        case "newFolder":
          setFolderDialog({ open: true, parentId: action.parentId });
          return;

        case "newFlow": {
          const node = findNode(tree, action.folderId);
          setNewFlowDialog({ folderId: action.folderId, folderName: node?.folder.name ?? "" });
          return;
        }

        case "importFolder": {
          const node = findNode(tree, action.folderId);
          setImportTarget({
            kind: "folder",
            folderId: action.folderId,
            folderName: action.folderName,
            existingTitles: node ? node.flows.map((f) => f.title) : [],
          });
          return;
        }

        case "importFlow": {
          const full = await getFlowByIdOrSlug(action.flow.slug);
          if (full) setImportTarget({ kind: "flow", flow: full });
          return;
        }

        case "attach":
          pendingAttach.current = { flow: action.flow, fileKind: action.fileKind };
          setAttachKind(action.fileKind);
          // Abre o seletor de arquivo depois que o estado atualizar o atributo accept.
          setTimeout(() => fileInput.current?.click(), 0);
          return;
      }
    },
    [tree]
  );

  // Recebe o arquivo escolhido para SVG ou PDF
  const handleAttachChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const pending = pendingAttach.current;
    pendingAttach.current = null;
    if (!file || !pending) return;

    try {
      const full = await getFlowByIdOrSlug(pending.flow.slug);
      if (!full) throw new Error("Fluxo não encontrado.");

      if (pending.fileKind === "svg") {
        if (full.bizagi_data && !confirm("Trocar o SVG remove os itens clicáveis do Bizagi deste fluxo. Continuar?")) return;
        await attachSvg(full.id, await file.text());
      } else {
        if (full.pdf_url && !confirm("Substituir o PDF atual deste fluxo?")) return;
        const res = await fetch(`/api/flows/${full.id}/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao enviar o PDF.");
      }
      await handleDataChanged();
    } catch (err) {
      alert(`Não foi possível anexar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-white text-black">
      <Header
        breadcrumbs={breadcrumbs}
        flowTitle={selectedFlow?.title || null}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          tree={tree}
          loading={localLoading}
          selectedFlowId={selectedFlow?.id || null}
          onSelectFlow={handleSelectFlow}
          onAction={handleAction}
          onDataChanged={handleDataChanged}
        />
        <main className="flex-1 relative overflow-hidden bg-gray-50">
          {selectedFlow ? (
            <>
              <div className="absolute top-2 right-4 z-10">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/embed/${selectedFlow.slug}`);
                    const btn = document.getElementById('copy-embed-btn');
                    if (btn) {
                      btn.innerHTML = 'COPIADO!';
                      setTimeout(() => {
                        btn.innerHTML = 'COPIAR LINK';
                      }, 2000);
                    }
                  }}
                  id="copy-embed-btn"
                  className="bg-white hover:bg-gray-100 text-black border border-black px-3 py-1 text-[10px] font-bold uppercase"
                  title="Copiar link para tela de diagrama"
                >
                  Copiar Link
                </button>
              </div>
              <FlowViewer key={selectedFlow.id} flow={selectedFlow} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {localLoading ? "Carregando..." : "Selecione um processo na lista ao lado"}
              </p>
              {isAdmin && !localLoading && (
                <p className="text-[10px] uppercase tracking-tight text-gray-400">
                  Clique com o botão direito em uma pasta para criar fluxos ou importar Bizagi.
                </p>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Seletor de arquivo para SVG ou PDF (acionado pelo menu do fluxo) */}
      <input
        ref={fileInput}
        type="file"
        accept={attachKind === "svg" ? ".svg,image/svg+xml" : "application/pdf,.pdf"}
        className="hidden"
        onChange={handleAttachChosen}
      />

      {/* Diálogos */}
      <CreateFolderDialog
        key={`folder-${folderDialog.open}-${folderDialog.parentId ?? "root"}`}
        open={folderDialog.open}
        onClose={() => setFolderDialog({ open: false, parentId: null })}
        tree={tree}
        defaultParentId={folderDialog.parentId}
        onCreated={handleDataChanged}
      />
      {newFlowDialog && (
        <NewFlowDialog
          open
          folderId={newFlowDialog.folderId}
          folderName={newFlowDialog.folderName}
          existingTitles={findNode(tree, newFlowDialog.folderId)?.flows.map((f) => f.title) ?? []}
          onClose={() => setNewFlowDialog(null)}
          onCreated={handleDataChanged}
        />
      )}
      <ImportFlowDialog
        open={!!importTarget}
        target={importTarget}
        onClose={() => setImportTarget(null)}
        onDone={handleDataChanged}
      />
    </div>
  );
}
