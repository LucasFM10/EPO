"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Atraso da transição, em milissegundos, para compor entradas em sequência. */
  delay?: number;
  className?: string;
}

/**
 * Revela o conteúdo quando entra na área visível.
 * Sem JavaScript, ou com `prefers-reduced-motion`, o conteúdo permanece visível (ver globals.css).
 */
export default function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Sem IntersectionObserver, nada é ocultado: o conteúdo segue visível.
    if (!el || !("IntersectionObserver" in window)) return;

    const root = document.documentElement;
    root.classList.add("landing-ready");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      root.classList.remove("landing-ready");
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
