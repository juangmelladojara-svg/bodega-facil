"use client";

import { useState } from "react";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Barra de columnas simple para la tendencia de ingresos mensuales.
 * Mark spec: barras finas (max 22px), remate redondeado 4px arriba, base
 * cuadrada; una sola serie → sin leyenda (el título ya dice qué se grafica).
 * Tooltip on hover por columna (interaction.md: todo chart es interactivo).
 */
export default function RevenueTrendChart({ data }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.amount));

  return (
    <div>
      <div className="flex h-36 items-stretch gap-2">
        {data.map((d, i) => {
          const heightPct = Math.max((d.amount / max) * 100, d.amount > 0 ? 3 : 0);
          const isDimmed = hoverIndex !== null && hoverIndex !== i;
          return (
            <div
              key={d.key}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {hoverIndex === i && (
                <div className="absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg">
                  <p className="font-medium text-text">{clp.format(d.amount)}</p>
                  <p className="text-text-muted">{d.monthLabel}</p>
                </div>
              )}
              <div
                className="w-full max-w-[26px] rounded-t bg-accent transition-opacity"
                style={{ height: `${heightPct}%`, opacity: isDimmed ? 0.4 : 1 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[11px] text-text-muted">
            {d.shortLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
