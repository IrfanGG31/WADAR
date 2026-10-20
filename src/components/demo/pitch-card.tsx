import { Bot, LineChart, Package, Rocket, Store, Target, TriangleAlert } from "lucide-react";
import { brand } from "@/brand";

const PROBLEMS = [
  "Penjualan dicatat di buku atau ingatan; untung bersih baru ketahuan (atau tidak pernah) di akhir bulan.",
  "Komisi GoFood/Shopee dan diskon promo memotong untung tanpa terasa.",
  "Chat pembeli menumpuk saat warung ramai; yang tidak dibalas pindah ke toko lain.",
  "Stok laris habis mendadak, stok lambat menumpuk modal.",
];

const PILLARS = [
  { icon: LineChart, title: "Kasir → untung bersih otomatis", body: "Setiap transaksi langsung jadi stok, laporan, dan untung bersih per kanal setelah komisi & diskon." },
  { icon: Bot, title: "Asisten chat 24 jam", body: "Menjawab pembeli di web, WhatsApp, dan Telegram dari data toko. Tidak pernah membuka modal/margin; yang sulit diteruskan ke pemilik." },
  { icon: Package, title: "Prediksi & Autopilot", body: "Tahu kapan stok habis dan berapa yang dipesan; Konsultasi Bisnis menjawab \"kenapa untung turun?\" dari angka toko sendiri." },
];

const SEGMENTS = ["Cafe & warkop", "Warung makan", "Toko kelontong", "Penjual online (Shopee/TikTok)"];

const ROADMAP = [
  ["Okt 2026", "Demo final BPC"],
  ["Jan–Mar 2027", "Pilot 30 UMKM Surabaya & Malang"],
  ["Apr 2027", "Peluncuran berbayar: Starter / Growth / Pro, trial 14 hari"],
] as const;

/** "Tentang WADAR" in 30 seconds: problem, solution, market, model, roadmap. Pure markup (server or client). */
export function PitchCard() {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <p className="font-display text-xl font-extrabold tracking-tight text-navy">{brand.name}</p>
        <p className="text-muted-foreground">Asisten bisnis AI untuk UMKM: kasir, stok, keuangan, dan chat pembeli dalam satu aplikasi HP.</p>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-navy">
          <TriangleAlert className="h-4 w-4 text-warning" aria-hidden /> Masalahnya
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          {PROBLEMS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-navy">
          <Rocket className="h-4 w-4 text-primary" aria-hidden /> Solusi WADAR
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-surface p-3">
              <p.icon className="mb-1.5 h-5 w-5 text-primary" aria-hidden />
              <p className="font-semibold text-navy">{p.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-navy">
            <Target className="h-4 w-4 text-primary" aria-hidden /> Untuk siapa
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {SEGMENTS.map((s) => (
              <span key={s} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {s}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Omzet Rp5–100 juta/bulan, 0–5 staf, HP Android sebagai alat kerja utama.</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-navy">
            <Store className="h-4 w-4 text-primary" aria-hidden /> Model bisnis & rencana
          </h3>
          <ol className="flex flex-col gap-1.5">
            {ROADMAP.map(([when, what]) => (
              <li key={when} className="flex gap-2 text-xs">
                <span className="w-24 shrink-0 font-semibold text-navy">{when}</span>
                <span className="text-muted-foreground">{what}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
