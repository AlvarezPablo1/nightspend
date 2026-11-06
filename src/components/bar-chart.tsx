"use client";

import { useState } from "react";
import { money, moneyShort } from "@/lib/format";

export type Bar = { key: string; label: string; tooltip: string; value: number; axisLabel?: string };

/** Gráfico de barras de una sola serie: tocá o pasá el mouse por una barra para ver el valor. */
export function BarChart({ bars, summary, height = 160 }: { bars: Bar[]; summary: string; height?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  const current = bars.find((b) => b.key === active);

  return (
    <figure>
      <figcaption className="num mb-3 min-h-5 text-sm">
        {current ? (
          <>
            <span className="text-muted">{current.tooltip} · </span>
            <span className="font-medium">{money(current.value)}</span>
          </>
        ) : (
          <span className="text-muted">{summary}</span>
        )}
      </figcaption>

      <div className="relative" style={{ height: height + 20 }} onMouseLeave={() => setActive(null)}>
        <span className="num absolute top-0 left-0 text-[11px] leading-4 text-muted">{moneyShort(max)}</span>
        <span className="absolute inset-x-0 top-5 h-px bg-line" />
        <div className="absolute inset-x-0 top-5 bottom-0 flex items-end gap-[2px] border-b border-line">
          {bars.map((b) => (
            <button
              key={b.key}
              type="button"
              aria-label={`${b.tooltip}: ${money(b.value)}`}
              onMouseEnter={() => setActive(b.key)}
              onFocus={() => setActive(b.key)}
              onClick={() => setActive(b.key)}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-end"
            >
              <span
                className={`block w-full rounded-t-[4px] ${
                  b.key === active ? "bg-accent-hover" : "bg-accent"
                }`}
                style={{
                  height: b.value > 0 ? `${Math.max((b.value / max) * 100, 1.5)}%` : 0,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1 flex gap-[2px]" aria-hidden>
        {bars.map((b) => (
          <span key={b.key} className="num min-w-0 flex-1 overflow-visible text-center text-[11px] whitespace-nowrap text-muted">
            {b.axisLabel ?? ""}
          </span>
        ))}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted">Ver como tabla</summary>
        <table className="num mt-2 w-full">
          <tbody>
            {bars
              .filter((b) => b.value > 0)
              .map((b) => (
                <tr key={b.key} className="border-t border-line">
                  <td className="py-1.5 text-muted">{b.label}</td>
                  <td className="py-1.5 text-right">{money(b.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
