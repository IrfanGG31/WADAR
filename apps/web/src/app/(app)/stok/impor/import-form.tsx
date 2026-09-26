"use client";

import type { ImportProductsResult } from "@wadar/contracts/catalog";
import { Button, Card, CardContent } from "@wadar/ui-web";
import { CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { errorMessage } from "../../../../lib/errors";
import { readSpreadsheet } from "../../../../lib/spreadsheet";

const TEMPLATE = "Nama,Varian,Harga,HPP,Stok,SKU,Barcode,Kategori\nKaos Polos,M,50000,30000,10,KP-M,,Pakaian\nKaos Polos,L,55000,32000,8,KP-L,,Pakaian\n";

export function ImportForm({ outletId }: { outletId: string }) {
  const [fileName, setFileName] = useState<string>();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<ImportProductsResult>();
  const [done, setDone] = useState<ImportProductsResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onFile(file: File) {
    setError(undefined);
    setPreview(undefined);
    setDone(undefined);
    setBusy(true);
    try {
      const parsed = await readSpreadsheet(file);
      if (parsed.length === 0) throw new Error("empty");
      if (parsed.length > 2000) {
        setError("Maksimal 2.000 baris per impor. Pecah file-nya jadi beberapa bagian.");
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setPreview(
        await apiFetch<ImportProductsResult>("/v1/products/import", {
          method: "POST",
          body: { outletId, dryRun: true, rows: parsed },
          idempotencyKey: crypto.randomUUID(),
        }),
      );
    } catch (err) {
      setError(err instanceof Error && err.message === "empty" ? "File kosong atau tidak terbaca." : errorMessage(err, "File tidak bisa dibaca."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      setDone(
        await apiFetch<ImportProductsResult>("/v1/products/import", {
          method: "POST",
          body: { outletId, dryRun: false, rows },
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      setPreview(undefined);
    } catch (err) {
      setError(errorMessage(err, "Impor gagal."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="mt-6">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          <p className="font-semibold">
            {done.productsCreated} produk ({done.variantsCreated} varian) berhasil diimpor.
          </p>
          {done.errors.length > 0 && <p className="text-sm text-muted-foreground">{done.errors.length} baris dilewati karena ada kesalahan.</p>}
          <p className="text-sm text-muted-foreground">Stok awal diproses di latar belakang, biasanya selesai dalam beberapa detik.</p>
          <Link href="/stok" className="font-medium text-primary underline">Lihat daftar produk</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center hover:bg-muted/50">
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
        <span className="font-medium">{fileName ?? "Pilih file .xlsx atau .csv"}</span>
        <span className="text-sm text-muted-foreground">{busy ? "Memeriksa..." : "Kami cek dulu sebelum disimpan"}</span>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
        download="contoh-impor-produk.csv"
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary underline"
      >
        <Download className="h-4 w-4" /> Unduh contoh file
      </a>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {preview && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <p className="font-semibold">
              {preview.validRows} dari {preview.totalRows} baris siap diimpor
            </p>
            {preview.errors.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-destructive">{preview.errors.length} baris bermasalah (akan dilewati):</p>
                <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
                  {preview.errors.map((e) => (
                    <li key={e.row} className="flex gap-3 px-3 py-2">
                      <span className="w-16 shrink-0 font-medium">Baris {e.row}</span>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button onClick={confirm} disabled={busy || preview.validRows === 0} className="self-start">
              {busy ? "Mengimpor..." : `Impor ${preview.validRows} baris`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
