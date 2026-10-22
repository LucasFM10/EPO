import Image from "next/image";
import Link from "next/link";
import ProcessCycle from "./ProcessCycle";
import Reveal from "./Reveal";

/**
 * Textos marcados como "provisório" não têm confirmação institucional.
 * Validar com a administração antes de divulgar.
 */
function ProvisionalTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-current/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest opacity-70">
      Texto provisório
    </span>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  tone = "light",
}: {
  id: string;
  eyebrow: string;
  title: string;
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <div className="max-w-2xl">
      <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${isDark ? "text-tjpb-gold" : "text-tjpb-blue"}`}>
        {eyebrow}
      </p>
      <h2
        id={id}
        className={`mt-4 text-3xl font-extrabold uppercase leading-tight tracking-tight sm:text-4xl lg:text-5xl ${
          isDark ? "text-white" : "text-tjpb-ink"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

export function About() {
  const pillars = [
    {
      title: "Missão",
      text: "Apoiar as unidades do Tribunal com processos mapeados, padronizados e continuamente aprimorados.",
    },
    {
      title: "Propósito",
      text: "Dar transparência e eficiência à atuação administrativa, com decisões baseadas em fluxos conhecidos.",
    },
    {
      title: "Valores",
      text: "Clareza, responsabilidade institucional, colaboração entre áreas e foco em resultados.",
    },
  ];

  return (
    <section id="sobre" aria-labelledby="sobre-title" className="relative bg-white py-24 text-tjpb-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-16 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <Reveal className="lg:col-span-5">
          <SectionHeading id="sobre-title" eyebrow="Sobre o escritório" title="Quem somos" />
          <div className="mt-6">
            <ProvisionalTag />
          </div>
          <div className="mt-10 flex items-center gap-6">
            <div className="rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgba(7,28,46,0.35)] ring-1 ring-black/5">
              <Image
                src="/brasão_tjpb.png"
                alt="Brasão do Tribunal de Justiça da Paraíba"
                width={500}
                height={500}
                unoptimized
                className="h-24 w-24 object-contain"
              />
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-tjpb-ink/70">
              Escritório de Processos Organizacionais do Tribunal de Justiça da Paraíba.
            </p>
          </div>
        </Reveal>

        <ul className="grid gap-5 lg:col-span-7">
          {pillars.map((item, i) => (
            <li
              key={item.title}
              className="group relative overflow-hidden rounded-2xl border border-tjpb-ink/10 bg-tjpb-mist/60 transition duration-500 hover:-translate-y-1 hover:border-tjpb-blue/40 hover:shadow-[0_24px_60px_-30px_rgba(12,60,94,0.45)]"
            >
              <Reveal delay={i * 100} className="p-7 sm:p-9">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-tjpb-blue transition-all duration-500 group-hover:w-2" />
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-tjpb-blue">{item.title}</h3>
                <p className="mt-3 text-lg leading-relaxed sm:text-xl">{item.text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function WhatWeDo() {
  const items = [
    { title: "Mapeamento", text: "Registro visual dos fluxos de trabalho, com etapas, responsáveis e decisões." },
    { title: "Padronização", text: "Modelos de processo comuns, para que o mesmo serviço seja executado do mesmo jeito." },
    { title: "Melhoria contínua", text: "Identificação de gargalos e retrabalho, com ajustes graduais e acompanhados." },
    { title: "Gestão de processos", text: "Governança sobre os fluxos: donos, versões e rotinas de revisão." },
    { title: "Otimização", text: "Eliminação de etapas desnecessárias para ganhar tempo e eficiência na execução." },
  ];

  return (
    <section id="atuacao" aria-labelledby="atuacao-title" className="relative overflow-hidden bg-tjpb-blue py-24 text-white sm:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-[4rem] border-[18px] border-white/5" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading id="atuacao-title" eyebrow="O que fazemos" title="Do mapa à melhoria" tone="dark" />
        </Reveal>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
          {items.map((item, i) => (
            <li key={item.title} className="group relative bg-tjpb-blue p-7 transition duration-500 hover:bg-tjpb-line/60 lg:min-h-64">
              <Reveal delay={i * 90}>
                <span className="font-mono text-sm text-tjpb-gold">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-10 text-xl font-bold leading-snug">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{item.text}</p>
                <span aria-hidden="true" className="absolute bottom-0 left-0 h-0.5 w-0 bg-tjpb-gold transition-all duration-500 group-hover:w-full" />
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ProcessManagement() {
  const withoutMapping = [
    "Etapas conhecidas só por quem as executa",
    "Retrabalho e demoras difíceis de rastrear",
    "Responsabilidades pouco claras entre áreas",
  ];
  const withMapping = [
    "Etapas documentadas e acessíveis a todos",
    "Gargalos identificados e tratados com método",
    "Donos definidos para cada fluxo e revisão periódica",
  ];

  return (
    <section id="gestao" aria-labelledby="gestao-title" className="bg-white py-24 text-tjpb-ink sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading id="gestao-title" eyebrow="Gestão por processos" title="Ver o fluxo muda a gestão" />
        </Reveal>

        <div className="mt-16 grid items-center gap-16 lg:grid-cols-2">
          <div className="grid gap-6">
            <Reveal>
              <article className="rounded-2xl border border-tjpb-ink/10 p-7">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-tjpb-ink/50">Sem mapeamento</h3>
                <ul className="mt-4 space-y-3 text-base text-tjpb-ink/80">
                  {withoutMapping.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-tjpb-ink/30" />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
            <Reveal delay={120}>
              <article className="rounded-2xl bg-tjpb-ink p-7 text-white shadow-[0_30px_60px_-30px_rgba(7,28,46,0.6)]">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-tjpb-gold">Com processos mapeados</h3>
                <ul className="mt-4 space-y-3 text-base text-white/85">
                  {withMapping.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-tjpb-gold" />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          </div>

          <Reveal delay={150}>
            <ProcessCycle />
            <p className="mt-4 text-center text-sm text-tjpb-ink/60">
              A melhoria não termina: cada ciclo volta ao mapeamento com dados melhores.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Explore() {
  return (
    <section id="explorar" aria-labelledby="explorar-title" className="relative overflow-hidden bg-tjpb-night py-24 text-white sm:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-24 h-[32rem] w-[32rem] rounded-[5rem] border-[22px] border-tjpb-frame/60" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <Reveal className="lg:col-span-6">
          <SectionHeading id="explorar-title" eyebrow="Plataforma" title="Explore os processos" tone="dark" />
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
            A plataforma do EPO reúne os fluxos organizados em pastas e os exibe em um visualizador
            interativo de diagramas BPMN.
          </p>
          <div className="mt-10">
            <Link
              href="/portal"
              className="group inline-flex items-center gap-3 rounded-full bg-tjpb-gold px-7 py-3.5 text-sm font-semibold text-tjpb-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Acessar o portal
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <p className="mt-4 text-xs text-white/45">Acesso ao portal mediante login institucional.</p>
          </div>
        </Reveal>

        <div className="grid gap-4 self-center lg:col-span-6">
          {[
            { k: "01", t: "Pastas e subpastas", d: "Os processos organizados em estrutura de pastas, para localizar cada fluxo com facilidade." },
            { k: "02", t: "Visualizador BPMN", d: "Diagramas interativos para acompanhar as etapas, decisões e responsáveis de cada fluxo." },
            { k: "03", t: "Link para diagrama", d: "Cada fluxo pode ser compartilhado por um endereço próprio, pensado para consulta." },
          ].map((f, i) => (
            <Reveal key={f.k} delay={i * 110}>
              <div className="group flex gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition duration-500 hover:border-tjpb-gold/40 hover:bg-white/[0.06]">
                <span className="font-mono text-sm text-tjpb-gold">{f.k}</span>
                <div>
                  <h3 className="text-lg font-bold">{f.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">{f.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Indicators() {
  const indicators = [
    "Processos mapeados",
    "Fluxos padronizados",
    "Unidades atendidas",
    "Ciclos de melhoria concluídos",
  ];

  return (
    <section id="indicadores" aria-labelledby="indicadores-title" className="bg-tjpb-mist py-24 text-tjpb-ink sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading id="indicadores-title" eyebrow="Indicadores" title="Resultados em números" />
            <ProvisionalTag />
          </div>
        </Reveal>

        <Reveal delay={100}>
          <dl className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-tjpb-ink/10 sm:grid-cols-2 lg:grid-cols-4">
            {indicators.map((label) => (
              <div key={label} className="bg-white p-8">
                <dt className="text-sm font-semibold uppercase tracking-widest text-tjpb-ink/60">{label}</dt>
                <dd className="mt-6 text-5xl font-extrabold tabular-nums text-tjpb-blue">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Valor a confirmar</span>
                </dd>
                <p className="mt-3 text-xs text-tjpb-ink/50">Valor a ser confirmado pelo escritório.</p>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-tjpb-ink py-16 text-white/70">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="flex items-start gap-5 lg:col-span-5">
          <div className="shrink-0 rounded-xl bg-white p-3">
            <Image src="/brasão_tjpb.png" alt="" width={500} height={500} unoptimized className="h-16 w-16 object-contain" />
          </div>
          <div>
            <p className="text-base font-bold text-white">Tribunal de Justiça da Paraíba</p>
            <p className="mt-1 text-sm">Escritório de Processos Organizacionais (EPO)</p>
          </div>
        </div>

        <nav aria-label="Links institucionais" className="grid grid-cols-2 gap-8 text-sm lg:col-span-5 lg:col-start-7">
          <ul className="space-y-3">
            <li>
              <a href="https://www.tjpb.jus.br" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                Site do TJPB
              </a>
            </li>
            <li>
              <a href="#explorar" className="hover:text-white">
                Explore os processos
              </a>
            </li>
          </ul>
          <ul className="space-y-3">
            <li>
              <Link href="/portal" className="hover:text-white">
                Portal
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-white">
                Acesso administrativo
              </Link>
            </li>
          </ul>
        </nav>

        <p className="border-t border-white/10 pt-8 text-xs text-white/50 lg:col-span-12">
          © {new Date().getFullYear()} Tribunal de Justiça da Paraíba. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
