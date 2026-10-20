"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { purgeDemoShops } from "./actions";

const AGES = [
  { days: 7, label: "lebih dari 7 hari" },
  { days: 3, label: "lebih dari 3 hari" },
  { days: 1, label: "lebih dari 1 hari" },
  { days: 0, label: "semua (termasuk hari ini)" },
] as const;

/** Removes visitor demo copies (anonymous "Coba demo" / /juri shops). Demo shops of real accounts stay. */
export function DemoCleanup({ visitorShops }: { visitorShops: number }) {
  const router = useRouter();
  const [days, setDays] = useState<(typeof AGES)[number]["days"]>(3);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-destructive/40 p-4">
      <div>
        <p className="font-semibold text-navy">Bersihkan toko demo pengunjung</p>
        <p className="text-sm text-muted-foreground">
          {visitorShops} salinan dibuat pengunjung tanpa akun (tombol &quot;Coba demo&quot; dan /juri). Toko demo milik akun asli, seperti tokomu, tidak ikut
          terhapus. Otomatis juga dibersihkan tiap malam untuk yang berumur lebih dari 7 hari.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value) as typeof days)}
          className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          aria-label="Umur toko demo yang dihapus"
        >
          {AGES.map((a) => (
            <option key={a.days} value={a.days}>
              Hapus yang {a.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/5"
          disabled={pending || visitorShops === 0}
          onClick={() => {
            if (!window.confirm("Hapus permanen toko demo pengunjung sesuai pilihan? Pengunjung yang kembali akan dibuatkan toko baru.")) return;
            setMessage(undefined);
            startTransition(async () => {
              const r = await purgeDemoShops({ days });
              setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Selesai." });
              router.refresh();
            });
          }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          Bersihkan
        </Button>
      </div>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
