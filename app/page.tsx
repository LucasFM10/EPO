import type { Metadata } from "next";
import LandingHeader from "@/components/landing/LandingHeader";
import Hero from "@/components/landing/Hero";
import { About, Explore, Indicators, LandingFooter, ProcessManagement, WhatWeDo } from "@/components/landing/Sections";

const TITLE = "EPO – Escritório de Processos do TJPB";
const DESCRIPTION =
  "O Escritório de Processos Organizacionais do Tribunal de Justiça da Paraíba mapeia, padroniza e aperfeiçoa os fluxos de trabalho da instituição.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "pt_BR",
    siteName: "EPO – TJPB",
  },
};

// Dados estruturados: identifica a instituição para mecanismos de busca.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "GovernmentOrganization",
  name: "Escritório de Processos Organizacionais – Tribunal de Justiça da Paraíba",
  alternateName: "EPO – TJPB",
  description: DESCRIPTION,
  parentOrganization: {
    "@type": "GovernmentOrganization",
    name: "Tribunal de Justiça da Paraíba",
  },
};

export default function HomePage() {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-tjpb-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-tjpb-ink"
      >
        Pular para o conteúdo
      </a>
      <LandingHeader />
      <main id="conteudo" className="flex-1">
        <Hero />
        <About />
        <WhatWeDo />
        <ProcessManagement />
        <Explore />
        <Indicators />
      </main>
      <LandingFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
