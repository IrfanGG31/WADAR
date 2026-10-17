"use client";

import { CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FIELD_LABELS, IMPORT_TEMPLATE_CSV, type ColumnOverrides, type ImportField } from "@/core/catalog-import";
import { shopPath } from "@/lib/routes";
import { importCatalog, previewCatalogImport, type ImportResult, type PreviewResult } from "./actions";

const FIELDS = Object.entries(FIELD_LABELS) as [ImportField, string][];
const PREVIEW_LIMIT = 50;
const selectClass =
  "h-11 rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm";

/** Unggah CSV → pratinjau (baris valid vs error, kolom tak dikenal bisa dipetakan) → impor. */
export function ImportClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [overrides, setOverrides] = useState<ColumnOverrides>({});
  const [preview, setPreview] = useState<PreviewResult>();
  const [result, setResult] = useState<ImportResult>();
  const [pending, startTransition] = useTransition();

  const runPreview = (f: { name: string; text: string }, o: ColumnOverrides) =>
    startTransition(async () => {
      setResult(undefined);
      setPreview(await previewCatalogImport(slug, f.text, o));
    });

  const pick = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    if (!chosen) return;
    const f = { name: chosen.name, text: await chosen.text() };
    setFile(f);
    setOverrides({});
    runPreview(f, {});
  };

  const mapHeader = (header: string, value: string) => {
    if (!file) return;
    const next = { ...overrides };
    if (value) next[header] = value as ImportField | "ignore";
    else delete next[header];
    setOverrides(next);
    runPreview(file, next);
  };

  const commit = () =>
    file &&
    startTransition(async () => {
      const r = await importCatalog(slug, file.name, file.text, overrides);
      setResult(r);
      if (!("error" in r)) {
        setPreview(undefined);
        router.refresh();
      }
    });

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + IMPORT_TEMPLATE_CSV], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "template-katalog-wadar.csv" }).click();
    URL.revokeObjectURL(url);
  };

  const unknown = preview && "error" in preview ? (preview.unknown ?? []) : [];
  const ready = preview && !("error" in preview) ? preview : undefined;
  const importable = ready ? ready.counts.create + ready.counts.update : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Kolom wajib: <strong>nama produk, SKU, harga jual, HPP</strong> (HPP boleh kosong kalau belum tahu). Kolom lain: varian, stok awal,
          kategori, satuan, stok minimum, deskripsi. Baris dengan nama produk sama jadi varian satu produk. Dari Excel / Google Sheets / ekspor
          Shopee: simpan sebagai CSV dulu.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4" aria-hidden />
            Unduh template
          </Button>
          <Label
            htmlFor="import-file"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-within:ring-2 focus-within:ring-primary"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
            Pilih file CSV
          </Label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void pick(e.currentTarget);
              e.currentTarget.value = "";
            }}
          />
        </div>
        {file && <p className="text-sm">File: <span className="font-medium">{file.name}</span></p>}
      </section>

      {preview && "error" in preview && (
        <section className="flex flex-col gap-3 rounded-xl border border-destructive/40 p-4" role="alert">
          <p className="text-sm text-destructive">{preview.error}</p>
          {unknown.map((header) => (
            <div key={header} className="flex flex-col gap-1.5">
              <Label htmlFor={`map-${header}`}>Kolom &quot;{header}&quot; dibaca sebagai</Label>
              <select id={`map-${header}`} value={overrides[header] ?? ""} onChange={(e) => mapHeader(header, e.target.value)} className={selectClass}>
                <option value="">— pilih —</option>
                <option value="ignore">Abaikan kolom ini</option>
                {FIELDS.map(([field, label]) => (
                  <option key={field} value={field}>{label}</option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}

      {ready && (
        <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <h2 className="text-lg font-semibold">Pratinjau</h2>
          <p className="text-sm">
            {ready.totalRows} baris: <strong>{ready.counts.create} baru</strong>, <strong>{ready.counts.update} diperbarui</strong> (SKU sudah ada),{" "}
            <strong className={ready.errors.length ? "text-destructive" : undefined}>{ready.errors.length} bermasalah</strong>.
          </p>
          {ready.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Baris</th>
                    <th className="py-1 pr-3 font-medium">Produk</th>
                    <th className="py-1 pr-3 font-medium">SKU</th>
                    <th className="py-1 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {ready.rows.slice(0, PREVIEW_LIMIT).map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="py-1 pr-3 tabular-nums">{r.line}</td>
                      <td className="py-1 pr-3">{r.option_label ? `${r.name} — ${r.option_label}` : r.name}</td>
                      <td className="py-1 pr-3 font-mono">{r.sku}</td>
                      <td className="py-1">
                        {r.action === "create" ? "Baru" : "Diperbarui"}
                        {r.stockIgnored && <span className="text-muted-foreground"> · stok awal tidak ditambah</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ready.rows.length > PREVIEW_LIMIT && (
                <p className="pt-2 text-sm text-muted-foreground">…dan {ready.rows.length - PREVIEW_LIMIT} baris lagi.</p>
              )}
            </div>
          )}
          <RowErrors errors={ready.errors} />
          <Button type="button" disabled={pending || importable === 0} onClick={commit} className="self-start">
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Impor {importable} baris
          </Button>
        </section>
      )}

      {result && "error" in result && (
        <p className="text-sm text-destructive" role="alert">{result.error}</p>
      )}
      {result && !("error" in result) && (
        <section className="flex flex-col gap-3 rounded-xl border border-border p-4" role="status">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            {result.created} varian baru, {result.updated} diperbarui
            {result.errors.length > 0 && `, ${result.errors.length} baris dilewati`}.
          </p>
          <RowErrors errors={result.errors} />
          <Link href={shopPath(slug, "stok")} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Lihat stok
          </Link>
        </section>
      )}
    </div>
  );
}

function RowErrors({ errors }: { errors: { line: number; sku: string; message: string }[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-destructive">
      {errors.slice(0, PREVIEW_LIMIT).map((e) => (
        <li key={`${e.line}-${e.sku}`}>
          Baris {e.line}
          {e.sku && <span className="font-mono"> ({e.sku})</span>}: {e.message}
        </li>
      ))}
      {errors.length > PREVIEW_LIMIT && <li>…dan {errors.length - PREVIEW_LIMIT} baris lagi.</li>}
    </ul>
  );
}
