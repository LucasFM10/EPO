"use client";

import React from "react";
import { ChevronRight, User, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Folder } from "@/lib/types";
import DataMenu from "@/components/DataMenu";

interface HeaderProps {
  breadcrumbs: Folder[];
  flowTitle: string | null;
}

export default function Header({ breadcrumbs, flowTitle }: HeaderProps) {
  const { user, signOut } = useAuth();

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

            <DataMenu />

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
