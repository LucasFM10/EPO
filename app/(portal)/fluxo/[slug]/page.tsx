"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import FlowViewer from "@/components/FlowViewer";
import { getFlowByIdOrSlug } from "@/lib/queries";
import type { Flow } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft, Copy, Check } from "lucide-react";

export default function FluxoPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadFlow() {
      try {
        const data = await getFlowByIdOrSlug(slug);
        setFlow(data);
      } catch (err) {
        console.error("Error loading flow:", err);
      } finally {
        setLoading(false);
      }
    }
    if (slug) loadFlow();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0d1f35] text-white">
        <div className="animate-pulse">Carregando fluxo...</div>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0d1f35] text-white p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Fluxo não encontrado</h1>
        <p className="text-white/60 mb-8">Pode ter sido removido ou o link está incorreto.</p>
        <Link href="/portal" className="bg-[#c8a84b] text-[#0d1f35] px-6 py-2 rounded-md font-bold">
          Voltar ao Portal
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d1f35]">
      <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0d1f35]/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/portal" className="text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-white font-bold text-lg">{flow.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/embed/${slug}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/10 text-sm font-medium"
            title="Copiar link para tela de diagrama"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? "Copiado!" : "Copiar link do diagrama"}</span>
          </button>
          <div className="text-white/40 text-xs uppercase tracking-widest hidden sm:block border-l border-white/20 pl-4">
            Portal SISPOM • Escritório de Processos
          </div>
        </div>
      </header>
      <main className="flex-1 relative overflow-hidden">
        <FlowViewer flow={flow} />
      </main>
    </div>
  );
}
