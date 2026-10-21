"use client";

import React, { useRef, useState } from "react";
import { ChevronRight, User, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Folder } from "@/lib/types";

interface HeaderProps {
  breadcrumbs: Folder[];
  flowTitle: string | null;
}

export default function Header({ breadcrumbs, flowTitle }: HeaderProps) {
  const { user, signOut } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao importar.");

      const lines = [
        "Importação concluída.",
        `Pastas: ${data.folders.inserted} criadas, ${data.folders.skipped} já existiam.`,
        `Fluxos: ${data.flows.inserted} criados, ${data.flows.skipped} já existiam.`,
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
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <header className="h-16 bg-white border-b border-black flex items-center justify-between px-6 text-black shrink-0">
      <div className="flex items-center gap-4">
        {/* --- LOGO CROP & POSITION SETTINGS --- */}
        {/* Ajuste os valores abaixo para posicionar e "aparar" a logo */}
        <div style={{ 
          // 1. POSIÇÃO GLOBAL (Move a janela inteira)
          position: 'relative',
          top: '10px',          // Posiciona a janela para CIMA ou BAIXO
          left: '0px',         // Posiciona a janela para ESQUERDA ou DIREITA

          // 2. TAMANHO DA JANELA (O que é visível)
          width: '180px',      
          height: '100px',      
          overflow: 'hidden',  
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start'
        }}>
          <img 
            src="/logo-epo.png" 
            alt="EPO Logo" 
            style={{
              // 3. AJUSTE INTERNO (Apara/Corta a imagem dentro da janela)
              height: '110px',      
              width: 'auto',
              marginTop: '-15px',   
              marginLeft: '-5px'    
            }} 
          />
        </div>
        {/* --- END SETTINGS --- */}

        <div className="h-4 w-px bg-gray-300" />

        <nav className="flex items-center text-xs font-bold uppercase tracking-tight text-gray-500">
          <span>Início</span>
          {breadcrumbs.map((folder) => (
            <React.Fragment key={folder.id}>
              <span className="mx-1.5 text-gray-300">/</span>
              <span>{folder.name}</span>
            </React.Fragment>
          ))}
          {flowTitle && (
            <>
              <span className="mx-1.5 text-gray-300">/</span>
              <span className="text-black">{flowTitle}</span>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-center">
        {user && (
          <div className="flex items-center gap-4 pl-4 border-l border-gray-200">
            <div className="flex flex-col items-end">
              <span className="text-[14px] font-bold text-black leading-tight">
                {user.email}
              </span>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Admin</span>
            </div>
            
            <div className="h-8 w-px bg-gray-200" />

            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={handleImport}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={importing}
              className="text-[12px] font-bold uppercase underline hover:no-underline disabled:text-gray-400 disabled:no-underline"
            >
              {importing ? "Importando..." : "Importar"}
            </button>

            <button
              onClick={signOut}
              className="text-[12px] font-bold uppercase underline hover:no-underline"
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
