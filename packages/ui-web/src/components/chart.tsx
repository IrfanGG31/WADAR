export interface TrendPoint {
  label: string;
  /** Bar value (e.g. money in / sales). */
  value: number;
  /** Optional line value (e.g. profit), may be negative. */
  line?: number;
}

/**
 * Dependency-free SVG bar + line chart (keeps the Beranda bundle small for
 * the p75 ≤ 1,5 s target). Values are passed pre-scaled; `format` renders
 * the accessible table and tooltips.
 */
export function TrendChart({
  points,
  format,
  barLabel,
  lineLabel,
  height = 180,
}: {
  points: TrendPoint[];
  format: (value: number) => string;
  barLabel: string;
  lineLabel?: string;
  height?: number;
}) {
  const width = 100 * points.length;
  const values = points.flatMap((p) => [p.value, p.line ?? 0]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min;
  const y = (v: number) => ((max - v) / span) * (height - 8) + 4;
  const zero = y(0);
  const hasLine = points.some((p) => p.line !== undefined);

  return (
    <figure className="w-full">
      {/* Stretched to the container (preserveAspectRatio="none") so bars fill a phone
          screen; labels live in HTML below so they stay readable at any width. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`${barLabel}${hasLine && lineLabel ? ` dan ${lineLabel}` : ""} per hari`}
      >
        <line x1={0} x2={width} y1={zero} y2={zero} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => {
          const top = y(Math.max(p.value, 0));
          return (
            <rect key={p.label} x={i * 100 + 18} width={64} y={top} height={Math.max(zero - top, p.value > 0 ? 2 : 0)} rx={4} className="fill-primary/80">
              <title>{`${p.label}: ${format(p.value)}`}</title>
            </rect>
          );
        })}
        {hasLine && (
          <polyline
            fill="none"
            className="stroke-emerald-500"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={points.map((p, i) => `${i * 100 + 50},${y(p.line ?? 0)}`).join(" ")}
          />
        )}
      </svg>
      <div className="mt-1 grid text-center text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <span key={p.label} className="truncate">{p.label}</span>
        ))}
      </div>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary/80" /> {barLabel}</span>
        {hasLine && lineLabel && <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-emerald-500" /> {lineLabel}</span>}
      </figcaption>
      <table className="sr-only">
        <thead>
          <tr><th>Hari</th><th>{barLabel}</th>{hasLine && <th>{lineLabel}</th>}</tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}><td>{p.label}</td><td>{format(p.value)}</td>{hasLine && <td>{format(p.line ?? 0)}</td>}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
