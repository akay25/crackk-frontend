import { REPORT_PLACEHOLDER } from "../constants";

/** Dependency-free SVG line chart for the (placeholder) running-score journey. */
export default function JourneyChart() {
  const { labels, scores } = REPORT_PLACEHOLDER.journey;
  const W = 640;
  const H = 220;
  const padX = 36;
  const padY = 28;
  const min = 40;
  const max = 90;
  const x = (i: number) => padX + (i * (W - padX * 2)) / (scores.length - 1);
  const y = (v: number) => H - padY - ((v - min) / (max - min)) * (H - padY * 2);
  const line = scores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${H - padY} ${line} ${x(scores.length - 1)},${H - padY}`;
  const gridYs = [40, 50, 60, 70, 80, 90];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="journeyFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(79,70,229,0.18)" />
          <stop offset="100%" stopColor="rgba(79,70,229,0)" />
        </linearGradient>
      </defs>
      {gridYs.map((v) => (
        <g key={v}>
          <line x1={padX} y1={y(v)} x2={W - padX} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={padX - 10} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
            {v}
          </text>
        </g>
      ))}
      <polygon points={area} fill="url(#journeyFill)" />
      <polyline points={line} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {scores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
      ))}
      {labels.map((lbl, i) => (
        <text key={lbl} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">
          {lbl}
        </text>
      ))}
    </svg>
  );
}
