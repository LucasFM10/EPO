"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlignLeft, Info, X, ExternalLink } from "lucide-react";

import DiagramBackgroundNode, { DiagramBackgroundNodeType } from "./DiagramBackgroundNode";
import HotspotNode, { HotspotNodeType } from "./HotspotNode";
import type { Flow } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize-html";

const nodeTypes = {
  diagramBackground: DiagramBackgroundNode,
  hotspot: HotspotNode,
};

type AppNode = DiagramBackgroundNodeType | HotspotNodeType;

/** Elemento do modelo Bizagi (só os campos usados aqui). */
interface BizagiElement {
  id?: string;
  name?: string;
  description?: string;
  elementType?: string;
  imageBounds?: { points?: { x: number; y: number }[]; width: number; height: number };
  pageElements?: BizagiElement[];
  elements?: BizagiElement[];
}

type Tab = "diagram" | "pdf";

interface FlowViewerProps {
  flow: Flow;
}

export default function FlowViewer({ flow }: FlowViewerProps) {
  const [tab, setTab] = useState<Tab>(() => (!flow.svg_url && !flow.bizagi_data && flow.pdf_url ? "pdf" : "diagram"));
  const [selectedNodeData, setSelectedNodeData] = useState<{
    name: string;
    description: string;
  } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);

  useEffect(() => {
    // Sem SVG não há diagrama para mostrar (os itens clicáveis dependem da imagem).
    if (!flow.svg_url) {
      setNodes([]);
      return;
    }
    const imageUrl = flow.svg_url;

    // Itens clicáveis: só existem quando o fluxo tem a camada interativa do Bizagi.
    const hotspots: AppNode[] = [];
    const page = (flow.bizagi_data as { pages?: BizagiElement[] } | null)?.pages?.[0];

    const extractElements = (elements: BizagiElement[]) => {
      for (const el of elements) {
        if (el.imageBounds && el.imageBounds.points && el.imageBounds.points.length > 0) {
          if (el.elementType !== "Participant" && el.elementType !== "SequenceFlow" && el.elementType !== "MessageFlow") {
            hotspots.push({
              id: `hotspot-${el.id}`,
              type: "hotspot",
              position: {
                x: el.imageBounds.points[0].x,
                y: el.imageBounds.points[0].y,
              },
              data: {
                name: el.name || "Sem Nome",
                description: el.description || "",
              },
              style: {
                width: el.imageBounds.width,
                height: el.imageBounds.height,
              },
              draggable: false,
              selectable: false,
              zIndex: 10,
            });
          }
        }
        if (el.pageElements) extractElements(el.pageElements);
        if (el.elements) extractElements(el.elements);
      }
    };

    if (page?.elements) extractElements(page.elements);
    if (page?.pageElements) extractElements(page.pageElements);

    // Lê as dimensões reais do SVG (viewBox) para posicionar a imagem de fundo.
    fetch(imageUrl)
      .then((res) => res.text())
      .then((text) => {
        let vw = 2000, vh = 1000;
        const match = text.match(/viewBox="([^"]+)"/);
        if (match) {
          const parts = match[1].split(",").map((s) => parseFloat(s.trim()));
          if (parts.length === 4) {
            vw = parts[2];
            vh = parts[3];
          }
        }

        const newNodes: AppNode[] = [
          {
            id: "diagram-bg",
            type: "diagramBackground",
            position: { x: 0, y: 0 },
            data: { imageUrl, width: vw, height: vh },
            draggable: false,
            selectable: false,
            zIndex: -1,
          },
          ...hotspots,
        ];

        setNodes(newNodes);
      })
      .catch(console.error);
  }, [flow, setNodes]);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    if (node.type === "hotspot" && node.data) {
      setSelectedNodeData({
        name: node.data.name as string,
        description: node.data.description as string,
      });
    }
  }, []);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors ${
      active ? "border-black text-black" : "border-transparent text-gray-400 hover:text-black"
    }`;

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {/* Abas: diagrama (SVG) e documento (PDF) */}
      <div className="flex items-end gap-2 px-4 border-b border-black shrink-0 bg-white">
        <button className={tabClass(tab === "diagram")} onClick={() => setTab("diagram")}>
          Diagrama
        </button>
        <button className={tabClass(tab === "pdf")} onClick={() => setTab("pdf")}>
          Documento (PDF)
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        {tab === "diagram" ? (
          flow.svg_url ? (
            <ReactFlow
              nodes={nodes}
              onNodesChange={onNodesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={2}
            >
              <Background />
              <Controls className="pb-2" />
            </ReactFlow>
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 max-w-md">
                Este fluxo ainda não tem diagrama. Clique com o botão direito nele na lista para anexar um SVG ou importar um Bizagi.
              </p>
            </div>
          )
        ) : flow.pdf_url ? (
          <div className="h-full flex flex-col">
            <div className="flex justify-end px-4 py-2 shrink-0">
              <a
                href={flow.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest underline"
              >
                <ExternalLink className="w-3 h-3" /> Abrir em nova aba
              </a>
            </div>
            <iframe src={flow.pdf_url} title={`Documento de ${flow.title}`} className="w-full flex-1 border-0" />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-8 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 max-w-md">
              Este fluxo não tem documento PDF. Clique com o botão direito nele na lista para anexar um PDF.
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedNodeData && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setSelectedNodeData(null)}
          />
          <div className="relative bg-white border border-black p-8 w-full max-w-2xl shadow-none flex flex-col max-h-[90vh]">
            <button
              onClick={() => setSelectedNodeData(null)}
              className="absolute right-4 top-4 p-1 hover:bg-gray-100 text-black transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <header className="mb-8 border-b border-black pb-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                <Info className="w-4 h-4" /> Informações do Elemento
              </div>
              <h2 className="text-3xl font-black text-black uppercase tracking-tighter leading-none">
                {selectedNodeData.name || "Sem título"}
              </h2>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black bg-gray-100 inline-flex px-2 py-1">
                  <AlignLeft className="w-4 h-4" />
                  Descrição Detalhada
                </div>
                {selectedNodeData.description ? (
                  <div
                    className="text-base leading-relaxed text-black prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedNodeData.description) }}
                  />
                ) : (
                  <p className="text-sm text-gray-400 italic">Nenhuma descrição disponível para este elemento.</p>
                )}
              </section>
            </div>

            <footer className="mt-8 pt-4 border-t border-black flex justify-end">
              <button
                onClick={() => setSelectedNodeData(null)}
                className="px-6 py-2 bg-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors"
              >
                Fechar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
