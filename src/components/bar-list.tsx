// Single-series horizontal bars: one hue, thin marks with a rounded data end, values in ink
// at the bar tip, hover title on every row. Negative rows grow left from a shared baseline.
export interface BarRow {
  label: string;
  value: number;
  display: string;
  emphasis?: boolean;
}

export function BarList({ rows, caption, tone = "bg-arrive" }: { rows: BarRow[]; caption: string; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const hasNegative = rows.some((r) => r.value < 0);
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          // Leave room past the longest bar for its value label.
          const pct = (Math.abs(r.value) / max) * (hasNegative ? 32 : 78);
          return (
            <li key={r.label} className="grid grid-cols-[minmax(7rem,38%)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${r.display}`}>
              <span className={`truncate ${r.emphasis ? "font-semibold text-ink" : "text-ink-soft"}`}>{r.label}</span>
              <span className="relative flex h-5 items-center">
                {hasNegative && <span className="absolute left-1/2 top-0 h-5 w-px bg-line" aria-hidden />}
                <span
                  className="absolute flex h-5 items-center"
                  style={hasNegative ? (r.value < 0 ? { right: "50%", width: `${pct}%`, justifyContent: "flex-start" } : { left: "50%", width: `${pct}%` }) : { left: 0, width: `${pct}%` }}
                >
                  <span className={`h-2.5 w-full ${r.value < 0 ? "rounded-l-[4px] bg-ink-soft/40" : `rounded-r-[4px] ${tone}`}`} />
                </span>
                <span
                  className={`absolute whitespace-nowrap text-xs tabular-nums ${r.emphasis ? "font-bold text-ink" : "text-ink-soft"}`}
                  style={hasNegative
                    ? r.value < 0 ? { right: `calc(50% + ${pct}% + 6px)` } : { left: `calc(50% + ${pct}% + 6px)` }
                    : { left: `calc(${pct}% + 6px)` }}
                >
                  {r.display}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
