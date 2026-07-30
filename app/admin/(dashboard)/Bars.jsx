/**
 * Piezas de visualización reutilizables del dashboard, en HTML/CSS plano
 * (sin librería de gráficos). Paleta validada con scripts/validate_palette.js
 * de la skill dataviz — ok/danger para pares de estado (con ícono, nunca solo
 * color), azul/naranja para splits categóricos que no son "bueno/malo".
 */

/**
 * Medidor de una sola magnitud sobre un total (ej. ocupación): relleno de
 * color sobre un track neutro — el track es "no-dato", no una segunda
 * categoría, por eso no necesita separación CVD.
 */
export function Meter({ value, max, color = "var(--color-ok)" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 1000) / 10) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Barra de proporción 100% apilada para 2+ categorías reales (ninguna es
 * "vacío"). Segmentos separados por un gap de 2px en el color de la
 * superficie (spec de marks-and-anatomy). Ícono + label junto a cada
 * swatch — la identidad nunca depende solo del color.
 */
export function ProportionBar({ segments }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
        {segments.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={s.label}
              style={{ width: `${pct}%`, backgroundColor: s.color, marginLeft: i > 0 ? 2 : 0 }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => {
          const Icon = s.icon;
          return (
            <span key={s.label} className="flex items-center gap-1.5 text-sm">
              {Icon ? (
                <Icon className="size-3.5" style={{ color: s.color }} />
              ) : (
                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              )}
              <span className="font-medium text-text">{s.value}</span>
              <span className="text-text-muted">{s.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
