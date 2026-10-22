/**
 * Fluxograma ilustrativo no estilo BPMN (evento, tarefas, gateway, sequência).
 * Puramente decorativo: as animações são CSS e respeitam prefers-reduced-motion.
 */
export default function HeroDiagram() {
  const flow = "landing-flow";
  const connector = "fill-none stroke-tjpb-gold/80 stroke-[2]";

  return (
    <svg
      viewBox="0 0 560 400"
      className="h-auto w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id="hero-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,0.12)" />
        </pattern>
        <marker id="hero-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#c8a84b" />
        </marker>
      </defs>

      {/* Piscina */}
      <rect x="8" y="24" width="544" height="352" rx="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" />
      <rect x="8" y="24" width="544" height="352" rx="24" fill="url(#hero-dots)" />

      {/* Conexões */}
      <g>
        <path d="M74 120 H112" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
        <path d="M244 120 H274" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
        <path d="M326 120 H350" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
        <path d="M300 146 V258" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
        <path d="M425 154 V258" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
        <path d="M500 294 H530 V136" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
        <path d="M236 294 H178 V156" className={`${connector} ${flow}`} markerEnd="url(#hero-arrow)" />
      </g>

      {/* Evento inicial */}
      <circle cx="56" cy="120" r="18" fill="rgba(200,168,75,0.12)" stroke="#c8a84b" strokeWidth="3" className="landing-pulse" />
      <text x="56" y="160" textAnchor="middle" className="fill-white/60 text-[12px]">Demanda</text>

      {/* Tarefa: receber */}
      <rect x="112" y="86" width="132" height="68" rx="14" className="fill-tjpb-blue stroke-tjpb-line" strokeWidth="1.5" />
      <text x="178" y="116" textAnchor="middle" className="fill-white text-[13px] font-semibold">Receber</text>
      <text x="178" y="134" textAnchor="middle" className="fill-white text-[13px] font-semibold">demanda</text>

      {/* Gateway exclusivo */}
      <path d="M300 94 L326 120 L300 146 L274 120 Z" fill="rgba(200,168,75,0.16)" stroke="#c8a84b" strokeWidth="1.5" />
      <text x="300" y="82" textAnchor="middle" className="fill-white/70 text-[12px]">Conforme?</text>
      <text x="338" y="112" textAnchor="middle" className="fill-tjpb-gold text-[11px] font-semibold">sim</text>
      <text x="312" y="206" className="fill-tjpb-gold text-[11px] font-semibold">não</text>

      {/* Tarefa: executar */}
      <rect x="350" y="86" width="150" height="68" rx="14" className="fill-tjpb-blue stroke-tjpb-line" strokeWidth="1.5" />
      <text x="425" y="120" textAnchor="middle" dominantBaseline="middle" className="fill-white text-[13px] font-semibold">Executar ação</text>

      {/* Tarefa: revisar (laço de retorno) */}
      <rect x="236" y="260" width="132" height="68" rx="14" className="fill-tjpb-blue stroke-tjpb-line" strokeWidth="1.5" />
      <text x="302" y="294" textAnchor="middle" className="fill-white text-[13px] font-semibold">Revisar</text>
      <text x="302" y="312" textAnchor="middle" className="fill-white text-[13px] font-semibold">requisitos</text>

      {/* Tarefa: registrar */}
      <rect x="380" y="260" width="120" height="68" rx="14" className="fill-tjpb-blue stroke-tjpb-line" strokeWidth="1.5" />
      <text x="440" y="294" textAnchor="middle" className="fill-white text-[13px] font-semibold">Registrar</text>
      <text x="440" y="312" textAnchor="middle" className="fill-white text-[13px] font-semibold">resultado</text>

      {/* Evento final */}
      <circle cx="530" cy="120" r="14" fill="none" stroke="#ffffff" strokeWidth="4" />
    </svg>
  );
}
