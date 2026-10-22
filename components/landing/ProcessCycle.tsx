const STAGES = ["Mapear", "Padronizar", "Executar", "Medir", "Melhorar"];

const CX = 280;
const CY = 240;
const R = 150;
const LABEL_R = 200;

/** Posição de cada etapa sobre o anel, começando no topo e no sentido horário. */
function pointAt(index: number, radius: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / STAGES.length;
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

/** Ciclo de melhoria contínua: anel tracejado em rotação lenta e etapas fixas. */
export default function ProcessCycle() {
  return (
    <svg viewBox="0 0 560 480" className="mx-auto h-auto w-full max-w-md" role="img" aria-labelledby="cycle-title">
      <title id="cycle-title">
        Ciclo de melhoria contínua: mapear, padronizar, executar, medir e melhorar
      </title>

      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="rgba(200,168,75,0.5)"
        strokeWidth="2"
        strokeDasharray="4 12"
        strokeLinecap="round"
        className="landing-spin"
      />
      <circle cx={CX} cy={CY} r={R - 70} fill="rgba(12,60,94,0.04)" stroke="rgba(12,60,94,0.12)" />

      <text x={CX} y={CY - 6} textAnchor="middle" className="fill-tjpb-ink/50 text-[11px] uppercase tracking-[0.25em]">
        Ciclo
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" className="fill-tjpb-ink text-[18px] font-bold">
        contínuo
      </text>

      {STAGES.map((stage, i) => {
        const node = pointAt(i, R);
        const label = pointAt(i, LABEL_R);
        const anchor = label.x < CX - 10 ? "end" : label.x > CX + 10 ? "start" : "middle";
        return (
          <g key={stage}>
            <circle cx={node.x} cy={node.y} r="30" fill="#0c3c5e" stroke="#c8a84b" strokeWidth="2" />
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-white text-[15px] font-bold"
            >
              {String(i + 1).padStart(2, "0")}
            </text>
            <text
              x={label.x}
              y={label.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-tjpb-ink text-[14px] font-semibold"
            >
              {stage}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
