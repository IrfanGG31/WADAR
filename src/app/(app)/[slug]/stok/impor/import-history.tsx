import type { CatalogImportRow } from "@/db/catalog-imports";
import { formatDateTime } from "@/lib/format-date";

/** Failed rows listed per import; a bigger list is cut with "dan N baris lainnya". */
export const SHOWN_ERRORS = 50;

/** Past CSV imports of the shop (GAP #3): when, which file, how many rows were new / updated / failed, and why each failed. */
export function ImportHistory({ imports, timeZone }: { imports: CatalogImportRow[]; timeZone: string }) {
  return (
    <section aria-labelledby="import-history" className="flex flex-col gap-2">
      <h2 id="import-history" className="text-base font-semibold">
        Riwayat impor
      </h2>
      {imports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada impor.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {imports.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{r.file_name || "Tanpa nama file"}</span>
                <time dateTime={r.created_at} className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(r.created_at, timeZone)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.created_count} baru · {r.updated_count} diperbarui ·{" "}
                <span className={r.failed_count > 0 ? "text-destructive" : undefined}>{r.failed_count} gagal</span>
              </p>
              {r.errors.length > 0 && <FailedRows errors={r.errors} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FailedRows({ errors }: { errors: CatalogImportRow["errors"] }) {
  const shown = errors.slice(0, SHOWN_ERRORS);
  return (
    <details className="mt-1 text-xs">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        Lihat baris gagal ({errors.length})
      </summary>
      <ul className="flex flex-col gap-1 pb-1">
        {shown.map((e, i) => (
          <li key={`${e.line}-${i}`} className="flex gap-2">
            <span className="shrink-0 font-medium tabular-nums">Baris {e.line}</span>
            <span className="text-muted-foreground">
              {e.sku && <span className="font-mono">{e.sku}: </span>}
              {e.message}
            </span>
          </li>
        ))}
      </ul>
      {errors.length > shown.length && (
        <p className="text-muted-foreground">dan {errors.length - shown.length} baris lainnya</p>
      )}
    </details>
  );
}
