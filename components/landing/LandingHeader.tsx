"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "#sobre", label: "Sobre" },
  { href: "#atuacao", label: "O que fazemos" },
  { href: "#gestao", label: "Gestão por processos" },
  { href: "#explorar", label: "Processos" },
  { href: "#indicadores", label: "Indicadores" },
];

export default function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled || open
          ? "bg-tjpb-ink/85 backdrop-blur-md border-b border-white/10"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tjpb-gold">
          <Image
            src="/brand/epo-logo-light.png"
            alt="EPO – Escritório de Processos Organizacionais"
            width={640}
            height={324}
            unoptimized
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm text-white/75">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tjpb-gold rounded-sm">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/portal"
            className="hidden sm:inline-flex items-center rounded-full bg-tjpb-gold px-5 py-2 text-sm font-semibold text-tjpb-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Acessar portal
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tjpb-gold"
          >
            <span className="sr-only">{open ? "Fechar menu" : "Abrir menu"}</span>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        id="menu-mobile"
        hidden={!open}
        className="lg:hidden border-t border-white/10 bg-tjpb-ink/95 backdrop-blur-md"
      >
        <nav aria-label="Principal (celular)" className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ul className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-3 text-base text-white/80 hover:text-white border-b border-white/5"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/portal"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-tjpb-gold px-5 py-3 text-sm font-semibold text-tjpb-ink"
          >
            Acessar portal
          </Link>
        </nav>
      </div>
    </header>
  );
}
