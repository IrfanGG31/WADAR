import { ArrowDownRight, ArrowUpRight, Lightbulb, Minus } from "lucide-react";
import {
  CURRENT_LABEL,
  periodLabels,
  sumDailyRows,
  type CategorySlice,
  type DailyFinanceRow,
  type ProfitInsight,
  type SummaryCard,
} from "@/core/finance-insight";
import { formatRupiah, formatSignedRupiah } from "@/core/money";
import { formatPercent } from "@/core/number-format";
import { formatIsoDay } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/* Presentational pieces of the Ringkasan tab. Every number arrives computed
 * by src/core/finance-insight.ts; these only format and lay it out. */

const TONE_TEXT: Record<SummaryCard["tone"], string> = {
  good: "text-emerald-700",
  bad: "text-red-700",
  neutral: "text-muted-foreground",
};

/** Cost lines shown as deductions in the statement; the sign is presentation only (values arrive positive). */
const DEDUCTION: ReadonlySet<SummaryCard["key"]> = new Set(["C", "F", "S"]);

/**
 * Untung bersih as the headline, then the statement that leads to it:
 * Penjualan → − Modal → − Komisi → − Ongkir → Untung kotor (subtotal). One reading order instead of six equal tiles.
 */
export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  const np = cards.find((c) => c.key === "NP");
  const gp = cards.find((c) => c.key === "GP");
  const statement = cards.filter((c) => c.key !== "NP");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {np && (
        <section className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-navy p-6 text-white" aria-labelledby="untung-bersih">
          <div className="flex flex-col gap-2">
            <h2 id="untung-bersih" className="text-sm font-medium text-white/70">
              {np.label}
            </h2>
            <p className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{formatRupiah(np.value)}</p>
            <Delta card={np} inverse />
          </div>
          <dl className="grid gap-2 border-t border-white/15 pt-4 text-sm">
            {gp && (
              <div className="flex justify-between gap-4">
                <dt className="text-white/70">{gp.label}</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(gp.value)}</dd>
              </div>
            )}
            <div className="text-white/70">{np.hint}</div>
          </dl>
        </section>
      )}
      <section className="rounded-2xl border border-border p-2" aria-label="Rincian untung">
        <dl className="flex flex-col">
          {statement.map((c) => {
            const deduction = DEDUCTION.has(c.key);
            const subtotal = c.key === "GP";
            return (
              <div
                key={c.key}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 rounded-xl px-4 py-3",
                  subtotal && "mt-1 bg-surface",
                )}
              >
                <dt className={cn("text-sm", subtotal ? "font-semibold text-foreground" : "text-muted-foreground")}>{c.label}</dt>
                <dd className={cn("text-right tabular-nums", subtotal ? "text-xl font-bold text-navy" : "text-base font-semibold")}>
                  {deduction && c.value > 0 ? "−" : ""}
                  {formatRupiah(c.value)}
                </dd>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
                <span className="text-right">
                  <Delta card={c} compact />
                </span>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}

const TONE_ON_DARK: Record<SummaryCard["tone"], string> = {
  good: "text-emerald-300",
  bad: "text-red-300",
  neutral: "text-white/70",
};

function Delta({ card, inverse = false, compact = false }: { card: SummaryCard; inverse?: boolean; compact?: boolean }) {
  const Icon = card.delta > 0 ? ArrowUpRight : card.delta < 0 ? ArrowDownRight : Minus;
  const text =
    card.delta_pct !== null ? formatPercent(Math.abs(card.delta_pct)) : card.delta === 0 ? "tetap" : formatSignedRupiah(card.delta);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", inverse ? TONE_ON_DARK[card.tone] : TONE_TEXT[card.tone])}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{card.delta > 0 ? "naik" : card.delta < 0 ? "turun" : "tetap"}</span>
      {text}
      {!compact && <span className={cn("font-normal", inverse ? "text-white/60" : "text-muted-foreground")}>vs periode sebelumnya</span>}
    </span>
  );
}

/** "Kenapa untung berubah" — the FIN-5 decomposition, largest effect first, plus its template narrative. */
export function ProfitChangeCard({ insight }: { insight: ProfitInsight }) {
  const max = insight.effects.reduce((m, e) => Math.max(m, Math.abs(e.amount)), 0);
  const label = periodLabels(insight.days);
  return (
    <section className="rounded-2xl border border-border p-5" aria-labelledby="kenapa-untung">
      <h2 id="kenapa-untung" className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="h-4 w-4 text-accent" aria-hidden />
        Kenapa untung berubah?
      </h2>
      <p className="mt-2 text-sm">{insight.narrative}</p>
      {insight.comparable && insight.effects.length > 0 && (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {insight.effects.map((e) => (
              <li key={e.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className="truncate">{e.label}</span>
                <span className={cn("text-right font-medium tabular-nums", e.amount > 0 ? "text-emerald-700" : "text-red-700")}>
                  {formatSignedRupiah(e.amount)}
                </span>
                <div className="col-span-2 h-1.5 rounded-full bg-muted">
                  <div
                    className={cn("h-1.5 rounded-full", e.amount > 0 ? "bg-emerald-500" : "bg-red-400")}
                    style={{ width: `${max > 0 ? Math.max(2, (Math.abs(e.amount) / max) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Jumlah semua efek = perubahan untung bersih ({formatSignedRupiah(insight.change.delta)}): dari{" "}
            {formatRupiah(insight.change.np0)} ({label.previous}) ke {formatRupiah(insight.change.np1)} ({label.current}).
          </p>
        </>
      )}
    </section>
  );
}

/** Untung kotor per day of the current window — one horizontal bar row per day with full Rupiah amount, negative days in red. */
export function ProfitTrend({ rows, periodLabel = CURRENT_LABEL }: { rows: DailyFinanceRow[]; periodLabel?: string }) {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.GP)), 0);
  const total = sumDailyRows(rows);
  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="tren-untung">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tren-untung" className="text-sm font-semibold">
          Untung kotor per hari
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">Total {formatRupiah(total.GP)}</p>
      </div>
      {max === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Belum ada penjualan {periodLabel}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const widthPct = Math.max(2, Math.round((Math.abs(r.GP) / max) * 100));
            return (
              <li
                key={r.day}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:text-sm"
                title={`${formatIsoDay(r.day)} · penjualan ${formatRupiah(r.R)} · untung kotor ${formatRupiah(r.GP)}`}
              >
                <span className="truncate text-muted-foreground">{formatIsoDay(r.day)}</span>
                <div className="h-2.5 rounded-full bg-muted">
                  <div
                    role="img"
                    aria-label={`${formatIsoDay(r.day)}: untung kotor ${formatRupiah(r.GP)}`}
                    className={cn("h-2.5 rounded-full", r.GP < 0 ? "bg-red-500" : "bg-primary/80")}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className={cn("text-right font-medium tabular-nums", r.GP < 0 && "text-red-700")}>
                  {formatRupiah(r.GP)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* Categorical slots 1–5 of the validated reference palette (dataviz skill), fixed order; "Lainnya" is neutral. */
const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#94a3b8";

/** Penjualan bersih per kategori — donut plus a legend that doubles as the table view (label, %, rupiah). */
export function CategoryDonut({
  total,
  slices,
  otherLabel,
  periodLabel = CURRENT_LABEL,
}: {
  total: number;
  slices: CategorySlice[];
  otherLabel: string;
  periodLabel?: string;
}) {
  if (slices.length === 0) {
    return (
      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Penjualan per kategori</h2>
        <p className="py-8 text-center text-sm text-muted-foreground">Belum ada penjualan {periodLabel}.</p>
      </section>
    );
  }
  // Colour follows the category (alphabetical slot), not its rank this week.
  const named = slices.filter((s) => s.label !== otherLabel).map((s) => s.label).sort((a, b) => a.localeCompare(b, "id"));
  const colorOf = (s: CategorySlice) =>
    s.label === otherLabel ? OTHER_COLOR : CATEGORY_COLORS[named.indexOf(s.label) % CATEGORY_COLORS.length];

  const r = 52;
  const circumference = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2 : 0;
  const arcs = slices.map((s) => ({
    slice: s,
    dash: Math.max(0, (s.share_permille / 1000) * circumference - gap),
    offset: (s.start_permille / 1000) * circumference,
  }));

  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="donut-kategori">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="donut-kategori" className="text-sm font-semibold">
          Penjualan per kategori
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">Total {formatRupiah(total)}</p>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <svg
          viewBox="0 0 140 140"
          className="h-40 w-40 shrink-0"
          role="img"
          aria-label={`Komposisi penjualan ${periodLabel} per kategori, total ${formatRupiah(total)}`}
        >
          <g transform="rotate(-90 70 70)">
            {arcs.map(({ slice, dash, offset: o }) => (
              <circle
                key={slice.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={colorOf(slice)}
                strokeWidth="20"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-o}
              >
                <title>{`${slice.label}: ${formatPercent(slice.share_permille / 10)} · ${formatRupiah(slice.R)}`}</title>
              </circle>
            ))}
          </g>
          <text x="70" y="65" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            Penjualan
          </text>
          <text x="70" y="79" textAnchor="middle" className="fill-foreground text-[9.5px] font-semibold tabular-nums">
            {formatRupiah(total)}
          </text>
        </svg>
        <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: colorOf(s) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatPercent(s.share_permille / 10)}</span>
              <span className="shrink-0 text-right font-medium tabular-nums">{formatRupiah(s.R)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
