import type { CatalogImportRow } from "@/db/catalog-imports";
import { formatDateTime } from "@/lib/format-date";

/** Past CSV imports of the shop (GAP #3): when, which file, and how many rows were new / updated / failed. */
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
