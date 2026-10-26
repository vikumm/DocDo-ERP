"use client";
import { useState } from "react";

export type ColumnDatum = { label: string; value: number; display: string; detail?: string };

/** Série única: sem legenda (o título nomeia), hover com tooltip, rótulo só no maior valor. */
export function ColumnChart({ data, height = 200, ariaLabel }: { data: ColumnDatum[]; height?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.findIndex((d) => d.value === max);
  const ticks = [0, 0.5, 1];

  return (
    <figure aria-label={ariaLabel}>
      <div className="relative" style={{ height }}>
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-white/[0.06]" style={{ bottom: `${t * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end justify-around gap-2">
          {data.map((d, i) => {
            const h = (d.value / max) * 100;
            return (
              <div
                key={d.label}
                className="relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {(i === peak || hover === i) && d.value > 0 && (
                  <span className="absolute text-[11px] font-semibold text-ink-100 tabular-nums" style={{ bottom: `calc(${h}% + 6px)` }}>
                    {d.display}
                  </span>
                )}
                <div
                  className="w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity"
                  style={{ height: `${Math.max(h, d.value ? 1.5 : 0)}%`, opacity: hover === null || hover === i ? 1 : 0.45 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-8 rounded-lg bg-ink-950 px-2.5 py-1.5 text-xs whitespace-nowrap ring-1 ring-white/10">
                    <p className="font-semibold text-ink-50">{d.label}</p>
                    <p className="text-ink-300">{d.display}{d.detail && ` · ${d.detail}`}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-around gap-2">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[11px] text-ink-400">{d.label}</span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><th>{d.label}</th><td>{d.display}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
