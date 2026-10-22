import Link from "next/link";
import HeroDiagram from "./HeroDiagram";
import Reveal from "./Reveal";

/** Moldura geométrica inspirada na capa institucional (retângulos arredondados e chevrons). */
function FrameMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 380"
      aria-hidden="true"
      focusable="false"
      className={`landing-float pointer-events-none ${className}`}
    >
      <rect x="8" y="8" width="284" height="364" rx="26" fill="none" stroke="#0f3e61" strokeWidth="26" />
      <rect x="150" y="150" width="150" height="230" rx="18" fill="none" stroke="#124d78" strokeWidth="16" />
      <path d="M170 262 L220 212 L270 262" fill="none" stroke="#1d5a86" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M170 320 L220 270 L270 320" fill="none" stroke="#1d5a86" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-tjpb-ink text-white"
    >
      {/* Brilho de fundo e malha sutil */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(12,60,94,0.9),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(29,90,134,0.35),transparent_55%)]"
      />
      <FrameMotif className="absolute -right-24 top-24 hidden h-[70%] w-auto opacity-30 md:block lg:-right-10" />

      <div className="mx-auto grid min-h-[100svh] max-w-7xl items-center gap-12 px-4 pb-20 pt-28 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:pt-24">
        <div className="lg:col-span-6">
          <Reveal>
            <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-tjpb-gold">
              <span aria-hidden="true" className="h-px w-10 bg-tjpb-gold" />
              Tribunal de Justiça da Paraíba
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h1
              id="hero-title"
              className="mt-6 text-[2.6rem] font-extrabold uppercase leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl"
            >
              Processos claros.
              <span className="block text-white/55">Gestão que evolui.</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              O Escritório de Processos Organizacionais (EPO) mapeia, padroniza e aperfeiçoa os fluxos
              de trabalho do TJPB, com foco em eficiência administrativa e melhoria contínua.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/portal"
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-tjpb-gold px-7 py-3.5 text-sm font-semibold text-tjpb-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Explorar os processos
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a
                href="#sobre"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tjpb-gold"
              >
                Conhecer o escritório
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} className="lg:col-span-6">
          <div className="relative mx-auto w-full max-w-xl">
            <HeroDiagram />
            <p className="mt-4 text-center text-xs uppercase tracking-[0.2em] text-white/40">
              Fluxo ilustrativo
            </p>
          </div>
        </Reveal>
      </div>

      <a
        href="#sobre"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-white/50 transition hover:text-white md:block"
      >
        <span className="sr-only">Rolar para a seção Sobre</span>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="landing-float">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}
