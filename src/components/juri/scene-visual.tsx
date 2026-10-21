import { AlertTriangle, Bot, CheckCircle2, LineChart, Package, ShoppingCart, Sparkles, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import type { SceneId, SegmentExample } from "./tour-script";

function Frame({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="page-in flex h-full flex-col gap-3 rounded-2xl bg-background p-4 shadow-xl ring-1 ring-border sm:p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          {icon}
          {title}
        </p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">contoh tampilan</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 pt-1">{children}</div>
    </div>
  );
}

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** A static, app-like mockup of one tour scene (no real data; numbers from the segment example). */
export function SceneVisual({ scene, ex, shopName }: { scene: SceneId; ex: SegmentExample; shopName: string }) {
  switch (scene) {
    case "beranda":
      return (
        <Frame icon={<LineChart className="h-4 w-4 text-primary" aria-hidden />} title={`Beranda · ${shopName}`}>
          <div className="grid grid-cols-2 gap-2">
            <div className="kpi-glow rounded-xl bg-gradient-to-br from-navy to-primary p-3 text-white">
              <p className="text-xs text-white/80">Omzet hari ini</p>
              <p className="font-display text-2xl font-extrabold">{ex.revenueToday}</p>
              <p className="text-xs text-white/80">{ex.ordersToday}</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-muted-foreground">Untung kotor</p>
              <p className="font-display text-2xl font-extrabold text-navy">{ex.grossProfitToday}</p>
              <p className="text-xs text-success">setelah modal & komisi</p>
            </div>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="mb-2 text-xs text-muted-foreground">Omzet 7 hari</p>
            <div className="flex h-28 gap-2">
              {ex.week.map((h, i) => (
                <div key={DAYS[i]} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div className="tour-bar w-full rounded-t-md bg-primary/80" style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </Frame>
      );
    case "kasir":
      return (
        <Frame icon={<ShoppingCart className="h-4 w-4 text-primary" aria-hidden />} title="Kasir">
          <div className="grid grid-cols-3 gap-2">
            {ex.menu.map((m, i) => (
              <div key={m.name} className={i === 0 ? "rounded-xl bg-primary/10 p-3 ring-2 ring-primary" : "rounded-xl bg-surface p-3"}>
                <p className="text-2xl" aria-hidden>
                  {m.emoji}
                </p>
                <p className="mt-1 text-xs font-semibold leading-tight">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.price}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface p-3 text-sm">
            <span>
              2 × {ex.menu[0].name}
              <br />
              <span className="text-xs text-muted-foreground">Bayar: QRIS</span>
            </span>
            <span className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Simpan</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Stok & laporan ikut terbarui
          </p>
        </Frame>
      );
    case "stok":
      return (
        <Frame icon={<Package className="h-4 w-4 text-primary" aria-hidden />} title="Stok · prediksi">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="font-semibold text-navy">{ex.lowStock.name}</p>
              <p className="text-sm text-muted-foreground">{ex.lowStock.note}</p>
            </div>
          </div>
          {ex.menu.slice(1).map((m) => (
            <div key={m.name} className="flex items-center justify-between rounded-xl bg-surface p-3 text-sm">
              <span>
                {m.emoji} {m.name}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">aman</span>
            </div>
          ))}
        </Frame>
      );
    case "chat":
      return (
        <Frame icon={<Bot className="h-4 w-4 text-primary" aria-hidden />} title="Chat WhatsApp">
          <div className="mx-auto flex w-full max-w-xs flex-col gap-2 rounded-2xl bg-[#e7ddd3] p-3">
            <p className="self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">{ex.chat.question}</p>
            <p className="tour-pop self-end rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">{ex.chat.answer}</p>
            <p className="self-end text-[10px] text-muted-foreground">dijawab asisten · 3 detik</p>
          </div>
        </Frame>
      );
    case "keuangan":
      return (
        <Frame icon={<Wallet className="h-4 w-4 text-primary" aria-hidden />} title="Keuangan · 7 hari">
          <div className="flex flex-col divide-y divide-border rounded-xl bg-surface text-sm">
            {[
              ["Penjualan", ex.finance.sales],
              ["Modal barang", ex.finance.cost],
              ["Komisi aplikasi", ex.finance.fees],
            ].map(([k, v]) => (
              <p key={k} className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">{k}</span>
                <span className="tabular-nums">{v}</span>
              </p>
            ))}
            <p className="flex justify-between px-3 py-2 font-semibold text-navy">
              <span>Untung kotor</span>
              <span className="tabular-nums">{ex.finance.profit}</span>
            </p>
          </div>
          <p className="rounded-xl bg-primary/5 p-3 text-sm text-navy">{ex.finance.note}</p>
        </Frame>
      );
    case "konsultasi":
      return (
        <Frame icon={<Sparkles className="h-4 w-4 text-primary" aria-hidden />} title="Konsultasi Bisnis">
          <p className="self-end rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{ex.consult.question}</p>
          <p className="tour-pop self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">{ex.consult.answer}</p>
          <p className="text-xs text-muted-foreground">Angka dari data toko; AI hanya menjelaskan.</p>
        </Frame>
      );
  }
}
