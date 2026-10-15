import { sumDailyRows, type DailyFinanceRow } from "@/core/finance-insight";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import type { PeriodWindow } from "@/core/period";
import { formatIsoDate, formatIsoDay } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/** Days shown on the Detail tab (four weeks). */
export const DETAIL_DAYS = 28;

const COLUMNS: { key: Exclude<keyof DailyFinanceRow, "day" | "q">; label: string }[] = [
  { key: "R", label: "Penjualan bersih" },
  { key: "C", label: "Modal (HPP)" },
  { key: "F", label: "Komisi" },
  { key: "S", label: "Subsidi ongkir" },
  { key: "GP", label: "Untung kotor" },
  { key: "E", label: "Pengeluaran" },
  { key: "NP", label: "Untung bersih" },
];

/** Per-day finance table: totals card, then day cards on phones and a table from md up. Rows newest first. */
export function DailyFinanceTable({
  rows,
  total,
  window,
}: {
  rows: DailyFinanceRow[];
  total: ReturnType<typeof sumDailyRows>;
  window: PeriodWindow;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {DETAIL_DAYS} hari terakhir ({formatIsoDate(window.from)}–{formatIsoDate(window.to)})
      </p>

      <section className="grid grid-cols-2 gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm sm:grid-cols-4">
        <h2 className="col-span-full text-sm font-semibold">Total {DETAIL_DAYS} hari</h2>
        {COLUMNS.map((c) => (
          <div key={c.key} className="min-w-0">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn("truncate font-semibold tabular-nums", total[c.key] < 0 && "text-red-700")}>
              {formatRupiah(total[c.key])}
            </p>
          </div>
        ))}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Barang terjual</p>
          <p className="font-semibold tabular-nums">{formatCount(total.q)}</p>
        </div>
      </section>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.day} className="rounded-xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{formatIsoDay(r.day)}</h3>
              <p className={cn("text-sm font-semibold tabular-nums", r.NP < 0 && "text-red-700")}>{formatRupiah(r.NP)}</p>
            </div>
            {r.q === 0 && r.E === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Tidak ada penjualan atau pengeluaran.</p>
            ) : (
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {COLUMNS.filter((c) => c.key !== "NP").map((c) => (
                  <div key={c.key} className="flex min-w-0 justify-between gap-2">
                    <dt className="truncate text-xs text-muted-foreground">{c.label}</dt>
                    <dd className="tabular-nums">{formatRupiah(r[c.key])}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 text-right font-medium">Terjual</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.day} className={cn(r.q === 0 && r.E === 0 && "text-muted-foreground")}>
                <td className="whitespace-nowrap px-4 py-2">{formatIsoDay(r.day)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(r.q)}</td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-right tabular-nums",
                      c.key === "NP" && "font-semibold",
                      r[c.key] < 0 && "text-red-700",
                    )}
                  >
                    {formatRupiah(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border font-semibold">
            <tr>
              <td className="px-4 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCount(total.q)}</td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatRupiah(total[c.key])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
