"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type Marketplace,
  MARKETPLACES,
  matchLines,
  type ParsedMarketplaceFile,
  parseMarketplaceCsv,
  toImportPayload,
  type VariantRef,
} from "@/core/marketplace-import";
import { formatCount } from "@/core/number-format";
import { shopPath } from "@/lib/routes";
import { importMarketplaceOrders, type MarketplaceImportResult } from "./actions";

interface ChannelOption {
  id: string;
  kind: string;
  name: string;
  fee_pct: number;
  fee_fixed: number;
}

const SKIP = "";

/**
 * IMP-1..3: choose the seller-center export → preview (orders per status, unpaid skipped) →
 * "Perlu dicocokkan" for products the file names differently → import. Parsing runs in the
 * browser; only the matched orders go to the server (validated again there).
 */
export function MarketplaceImport({ timeZone, channels, variants }: { timeZone: string; channels: ChannelOption[]; variants: VariantRef[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedMarketplaceFile>();
  const [channelId, setChannelId] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MarketplaceImportResult>();
  const [pending, startTransition] = useTransition();

  const matched = useMemo(() => (parsed?.ok ? matchLines(parsed.orders, variants, manual) : null), [parsed, variants, manual]);
  const payload = useMemo(() => (parsed?.ok && matched ? toImportPayload(parsed.orders, matched.match) : null), [parsed, matched]);
  const channel = channels.find((c) => c.id === channelId);

  async function pick(file: File | undefined) {
    setResult(undefined);
    setManual({});
    if (!file) return;
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      setParsed({ ok: false, error: "File Excel belum didukung langsung. Buka di Excel/Google Sheets lalu simpan sebagai CSV, kemudian pilih file CSV-nya." });
      return;
    }
    const next = parseMarketplaceCsv(await file.text(), timeZone);
    setParsed(next);
    if (next.ok) {
      const guess = channels.find((c) => c.kind === next.detected) ?? channels.find((c) => ["shopee", "tiktok_shop", "tokopedia"].includes(c.kind));
      setChannelId(guess?.id ?? "");
    }
  }

  const counts = parsed?.ok
    ? {
        completed: parsed.orders.filter((o) => o.status === "completed").length,
        canceled: parsed.orders.filter((o) => o.status !== "completed").length,
      }
    : null;
  const marketplace: Marketplace | "other" = channel && channel.kind in MARKETPLACES ? (channel.kind as Marketplace) : "other";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileUp className="h-5 w-5 text-primary" aria-hidden />
          Impor pesanan marketplace
        </h2>
        <p className="text-sm text-muted-foreground">
          Unduh laporan pesanan dari Seller Center Shopee, TikTok Shop, atau Tokopedia (format CSV), lalu pilih di sini. Pesanan yang sudah pernah
          diimpor otomatis dilewati, jadi aman diimpor ulang.
        </p>
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 px-4 text-sm font-medium text-primary hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary">
          <FileUp className="h-4 w-4" aria-hidden />
          {fileName || "Pilih file CSV"}
          <input type="file" accept=".csv,text/csv,.xlsx,.xls" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {parsed && !parsed.ok && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {parsed.error}
          </p>
        )}
      </section>

      {parsed?.ok && counts && matched && payload && (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="pratinjau-impor">
          <h2 id="pratinjau-impor" className="font-semibold">Pratinjau</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mp-channel">Masuk ke kanal</Label>
            {channels.length === 0 ? (
              <p className="text-sm text-destructive">
                Belum ada kanal marketplace.{" "}
                <Link className="underline" href={shopPath(slug, "pengaturan/kanal")}>
                  Tambah kanal dulu
                </Link>
                .
              </p>
            ) : (
              <select
                id="mp-channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Pilih kanal…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {parsed.detected && (
              <p className="text-xs text-muted-foreground">Terdeteksi sebagai ekspor {MARKETPLACES[parsed.detected]}.</p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Pesanan masuk", value: counts.completed },
              { label: "Batal / retur", value: counts.canceled },
              { label: "Belum dibayar (dilewati)", value: parsed.unpaid },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-2">
                <dd className="text-lg font-semibold tabular-nums">{formatCount(s.value)}</dd>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
              </div>
            ))}
          </dl>
          {parsed.orders.some((o) => o.platform_fee === null) && channel && (
            <p className="text-xs text-muted-foreground">
              File ini tidak memuat biaya admin, jadi komisi diperkirakan dari tarif kanal ({channel.fee_pct}% + Rp{formatCount(channel.fee_fixed)} per pesanan).
            </p>
          )}

          {matched.unmatched.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                Perlu dicocokkan ({formatCount(matched.unmatched.length)} produk)
              </p>
              <p className="text-xs text-muted-foreground">
                Nama/SKU di file tidak sama dengan produkmu. Pilih produk yang sesuai; pesanan yang belum dicocokkan ditahan dulu.
              </p>
              {matched.unmatched.map((u) => (
                <div key={u.key} className="flex flex-col gap-1">
                  <Label htmlFor={`m-${u.key}`} className="text-xs">
                    {u.name} {u.key !== u.name && <span className="text-muted-foreground">(SKU {u.key})</span>}
                  </Label>
                  <select
                    id={`m-${u.key}`}
                    value={manual[u.key] ?? SKIP}
                    onChange={(e) => setManual((m) => ({ ...m, [u.key]: e.target.value }))}
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value={SKIP}>Belum dipilih</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                        {v.sku ? ` · ${v.sku}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {parsed.errors.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{formatCount(parsed.errors.length)} baris tidak terbaca</summary>
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {parsed.errors.slice(0, 20).map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    Baris {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Button
            type="button"
            size="lg"
            disabled={pending || !channelId || payload.ready.length === 0}
            onClick={() =>
              startTransition(async () => {
                const r = await importMarketplaceOrders(slug, { channel_id: channelId, marketplace, file_name: fileName, orders: payload.ready });
                setResult(r);
                if (!("error" in r)) router.refresh();
              })
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Impor {formatCount(payload.ready.length)} pesanan
          </Button>
          {payload.held > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">{formatCount(payload.held)} pesanan ditahan sampai produknya dicocokkan.</p>
          )}
          {result && "error" in result && (
            <p role="alert" className="text-sm text-destructive">
              {result.error}
            </p>
          )}
        </section>
      )}

      {result && "created" in result && (
        <section className="flex flex-col gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
            {formatCount(result.created)} pesanan masuk
          </p>
          <p className="text-sm text-muted-foreground">
            {formatCount(result.canceled)} batal/retur dicatat tanpa mengurangi stok · {formatCount(result.duplicate)} sudah pernah diimpor
            {result.failed > 0 ? ` · ${formatCount(result.failed)} gagal` : ""}
            {payload && payload.held > 0 ? ` · ${formatCount(payload.held)} ditahan (belum dicocokkan)` : ""}
          </p>
          {result.errors.length > 0 && (
            <ul className="list-inside list-disc text-xs text-destructive">
              {result.errors.slice(0, 10).map((e) => (
                <li key={e.order}>
                  {e.order}: {e.error}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={shopPath(slug, "keuangan")}>Lihat untung per kanal</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setParsed(undefined);
                setResult(undefined);
                setFileName("");
              }}
            >
              Impor file lain
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
