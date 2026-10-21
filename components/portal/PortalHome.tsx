"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import FlowViewer from "@/components/FlowViewer";
import CreateFolderDialog from "@/components/CreateFolderDialog";
import ImportFlowDialog from "@/components/ImportFlowDialog";
import { getFolderTree, getFlowByIdOrSlug, getFolderBreadcrumb } from "@/lib/queries";
import type { FolderTreeNode, Flow, Folder } from "@/lib/types";


export default function PortalHome() {
  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [localLoading, setLocalLoading] = useState(true);

  // Dialog states
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showImportFlow, setShowImportFlow] = useState(false);

  // Load folder tree
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

  // When a flow is selected from the sidebar, fetch its full data
  const handleSelectFlow = useCallback(async (flow: Flow) => {
    const fullFlow = await getFlowByIdOrSlug(flow.slug);
    if (fullFlow) {
      setSelectedFlow(fullFlow);
      const crumbs = await getFolderBreadcrumb(fullFlow.folder_id);
      setBreadcrumbs(crumbs);
    }
  }, []);

  // Auto-select the first flow if none is selected
  useEffect(() => {
    if (!selectedFlow && tree.length > 0) {
      const findFirstFlow = (nodes: FolderTreeNode[]): Flow | null => {
        for (const node of nodes) {
          if (node.flows.length > 0) return node.flows[0];
          const found = findFirstFlow(node.children);
          if (found) return found;
        }
        return null;
      };
      const first = findFirstFlow(tree);
      if (first) handleSelectFlow(first);
    }
  }, [tree, selectedFlow, handleSelectFlow]);

  // Callback when admin creates/imports something — refresh the tree
  const handleDataChanged = useCallback(() => {
    loadTree();
  }, [loadTree]);

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
          onCreateFolder={() => setShowCreateFolder(true)}
          onImportFlow={() => setShowImportFlow(true)}
          onDataChanged={handleDataChanged}
        />
        <main className="flex-1 relative overflow-hidden bg-gray-50">
          {selectedFlow ? (
            <>
              <div className="absolute top-4 right-4 z-10">
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
              <FlowViewer flow={selectedFlow} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-[10px] font-black uppercase tracking-widest">
              {localLoading ? "Carregando..." : "Selecione um fluxo"}
            </div>
          )}
        </main>
      </div>

      {/* Admin Dialogs */}
      <CreateFolderDialog
        open={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        tree={tree}
        onCreated={handleDataChanged}
      />
      <ImportFlowDialog
        open={showImportFlow}
        onClose={() => setShowImportFlow(false)}
        tree={tree}
        onCreated={handleDataChanged}
      />
    </div>
  );
}
