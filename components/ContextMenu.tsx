"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Separador visual acima deste item. */
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Menu de ações exibido com o botão direito (ou o botão de três pontos).
 * Fecha com Esc, clique fora ou rolagem. Setas, Home e End navegam pelo teclado.
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Mantém o menu dentro da tela.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - width - 8),
      top: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();

    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown") buttons[(index + 1) % buttons.length]?.focus();
      if (e.key === "ArrowUp") buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
      if (e.key === "Home") buttons[0]?.focus();
      if (e.key === "End") buttons[buttons.length - 1]?.focus();
      if (e.key === "Tab") {
        e.preventDefault();
      }
    };
    const onScroll = () => onClose();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 9999 }}
      className="bg-white border border-black shadow-none py-1 min-w-[190px] text-black"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {item.separatorBefore && <div className="my-1 border-t border-gray-200" />}
          <button
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-tight transition-colors hover:bg-black hover:text-white focus:bg-black focus:text-white focus:outline-none ${
              item.danger ? "text-red-600" : ""
            }`}
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
}
