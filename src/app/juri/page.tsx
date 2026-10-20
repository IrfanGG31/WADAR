import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { brand } from "@/brand";
import { JudgeEntry } from "@/components/demo/judge-entry";
import { PitchCard } from "@/components/demo/pitch-card";

export const metadata = { title: "Demo untuk Juri" };

/** /juri — the link sent to judges: pick a segment, get a private demo shop, nothing shared is touched. */
export default function JuriPage() {
  return (
    <main className="min-h-dvh bg-surface">
      <div className="page-in mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:py-14">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Image src={brand.mark.src} alt="" width={brand.mark.width} height={brand.mark.height} className="h-7 w-auto" priority />
            <span className="font-display text-xl font-extrabold tracking-tight text-navy">{brand.name}</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-navy md:text-4xl">Coba WADAR di toko sungguhan</h1>
          <p className="max-w-2xl text-muted-foreground">
            Pilih satu jenis usaha. WADAR menyiapkan toko contoh berisi 30 hari penjualan, khusus untuk Anda. Setelah masuk, tekan tombol{" "}
            <b>Mode Juri</b> di pojok kanan bawah untuk tur 1 menit.
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> Tanpa daftar. Setiap pengunjung mendapat salinan sendiri; silakan coba
            transaksi apa pun.
          </p>
        </header>
        <JudgeEntry />
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <PitchCard />
        </section>
      </div>
    </main>
  );
}
