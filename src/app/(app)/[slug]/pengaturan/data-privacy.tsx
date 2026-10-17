"use client";

import { Download, Loader2, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeletionStage } from "@/core/shop-deletion";
import { formatDateTime } from "@/lib/format-date";
import { cancelShopDeletion, exportShopData, purgeShop, requestShopDeletion } from "./data-actions";

/** Data & privasi (GAP #6): unduh semua data, hapus toko bertahap, tautan kebijakan privasi. */
export function DataPrivacy({ slug, deletion }: { slug: string; deletion: DeletionStage }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<{ error?: string; note?: string }>();
  const [pending, startTransition] = useTransition();
  const scheduled = deletion.stage === "scheduled";

  const run = (action: () => Promise<{ error?: string; note?: string } | undefined | void>) => {
    setMessage(undefined);
    startTransition(async () => {
      const result = await action();
      if (result) setMessage(result);
      setTyped("");
      router.refresh();
    });
  };

  const download = () =>
    run(async () => {
      const result = await exportShopData(slug);
      if ("error" in result) return result;
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: result.filename });
      a.click();
      URL.revokeObjectURL(url);
      return { note: `${result.filename} sudah diunduh.` };
    });

  return (
    <section id="data-privasi" className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Data &amp; privasi</h2>
        <p className="text-sm text-muted-foreground">
          Datamu milikmu. Baca{" "}
          <Link href="/privasi" className="font-medium text-primary underline-offset-4 hover:underline">
            kebijakan privasi
          </Link>
          .
        </p>
      </div>

      <Button type="button" variant="outline" disabled={pending} onClick={download} className="self-start">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Unduh semua data (ZIP)
      </Button>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-semibold">Hapus toko</h3>
        {scheduled ? (
          <p className="text-sm">
            Toko ditutup untuk pembeli dan akan dihapus permanen pada <strong>{formatDateTime(deletion.purgeAfter, "Asia/Jakarta")}</strong>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tahap 1: toko ditutup untuk pembeli dan dijadwalkan dihapus 7 hari lagi; selama itu kamu masih bisa membatalkan. Unduh datamu dulu.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-slug">
            Ketik <span className="font-mono">{slug}</span> untuk konfirmasi
          </Label>
          <Input id="confirm-slug" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-wrap gap-2">
          {scheduled ? (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => cancelShopDeletion(slug))}>
                <Undo2 className="h-4 w-4" />
                Batalkan penghapusan
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || typed.trim().toLowerCase() !== slug}
                onClick={() => {
                  if (window.confirm("Hapus permanen? Semua data toko hilang dan tidak bisa dikembalikan.")) run(() => purgeShop(slug, typed));
                }}
              >
                <Trash2 className="h-4 w-4" />
                Hapus permanen sekarang
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={pending || typed.trim().toLowerCase() !== slug}
              onClick={() => run(() => requestShopDeletion(slug, typed))}
            >
              <Trash2 className="h-4 w-4" />
              Jadwalkan hapus toko
            </Button>
          )}
        </div>
      </div>

      {message?.error && (
        <p role="alert" className="text-sm text-destructive">
          {message.error}
        </p>
      )}
      {message?.note && <p className="text-sm text-muted-foreground">{message.note}</p>}
    </section>
  );
}
