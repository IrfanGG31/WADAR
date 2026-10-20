"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** One stop of the tour: the element with `data-tour="<target>"`. Stops whose element is not on the page are skipped. */
export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  { target: "beranda-kpi", title: "Omzet & untung hari ini", body: "Terhitung otomatis dari setiap transaksi kasir dan marketplace. Tidak ada rekap manual." },
  { target: "beranda-trend", title: "Tren 7 hari", body: "Hari mana paling ramai, langsung kelihatan tanpa Excel." },
  { target: "beranda-stok", title: "Stok menipis, dengan prediksi", body: "WADAR menghitung kapan stok habis dari kecepatan jual harian dan menyarankan jumlah pesan ulang." },
  { target: "beranda-insight", title: "Insight untukmu", body: "Ringkasan mingguan dalam bahasa sehari-hari: kenapa untung naik atau turun." },
  { target: "nav-kasir", title: "Kasir 2 ketuk", body: "Pilih produk, pilih kanal (tunai, QRIS, GoFood), selesai. Stok dan laporan ikut bergerak." },
  { target: "nav-stok", title: "Stok & pembelian", body: "Satuan eceran (batang, liter, butir), stok masuk, pesanan ke pemasok." },
  { target: "nav-keuangan", title: "Untung bersih per kanal", body: "Setelah modal, diskon, dan komisi aplikasi. Dibandingkan dengan minggu lalu." },
  { target: "nav-chat", title: "Asisten chat pembeli", body: "Menjawab di web, WhatsApp, dan Telegram dari data toko; tidak pernah membuka modal atau margin." },
  { target: "nav-konsultasi", title: "Konsultasi Bisnis", body: "Tanya \"lanjut promo atau tidak?\" — jawabannya dari angka tokomu sendiri." },
];

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function findSteps(steps: TourStep[]) {
  return steps.filter((s) => {
    const el = document.querySelector(`[data-tour="${s.target}"]`);
    return el !== null && visible(el);
  });
}

/** Spotlight tour over the current page. `open` is controlled by the Judge dock. */
export function FeatureTour({ open, onClose, steps = TOUR_STEPS }: { open: boolean; onClose: () => void; steps?: TourStep[] }) {
  const [active, setActive] = useState<TourStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxStyle, setBoxStyle] = useState<CSSProperties>({ opacity: 0 });

  useEffect(() => {
    if (!open) return;
    // Measured on the next frame, once the page under the tour has painted.
    const raf = requestAnimationFrame(() => {
      const found = findSteps(steps);
      setActive(found);
      setIdx(0);
      if (found.length === 0) onClose();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, steps, onClose]);

  const step = open ? active[idx] : undefined;

  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const timer = window.setTimeout(update, 350);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (!rect || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + gap;
    let left = rect.left;
    if (rect.right + gap + box.width < vw && rect.height > box.height * 0.5 && rect.width < vw / 3) {
      // A sidebar item: to its right.
      top = rect.top;
      left = rect.right + gap;
    } else if (top + box.height > vh - 12) {
      top = rect.top - box.height - gap;
    }
    left = Math.max(12, Math.min(left, vw - box.width - 12));
    top = Math.max(12, Math.min(top, vh - box.height - 12));
    setBoxStyle({ top, left, opacity: 1 });
  }, [rect, idx]);

  const close = useCallback(() => {
    setRect(null);
    setBoxStyle({ opacity: 0 });
    onClose();
  }, [onClose]);
  const next = useCallback(() => (idx < active.length - 1 ? setIdx(idx + 1) : close()), [idx, active.length, close]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, next, prev, close]);

  if (!step) return null;
  const pad = 8;
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Tur fitur: ${step.title}`}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Tutup tur" onClick={close} />
      {rect && (
        <div
          aria-hidden
          className="tour-spotlight pointer-events-none fixed rounded-xl ring-2 ring-sky transition-all duration-300"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgb(8 42 92 / 0.55)" }}
        />
      )}
      <div ref={boxRef} style={boxStyle} className="fixed w-[min(20rem,calc(100vw-24px))] rounded-2xl bg-background shadow-2xl ring-1 ring-border transition-opacity">
        <div className="flex items-start justify-between gap-3 rounded-t-2xl bg-gradient-to-br from-primary/10 to-sky/10 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              {idx + 1} dari {active.length}
            </p>
            <p className="font-semibold leading-snug text-navy">{step.title}</p>
          </div>
          <button type="button" onClick={close} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Tutup tur">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 py-3 text-sm leading-relaxed text-foreground/85">{step.body}</p>
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((idx + 1) / active.length) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between px-4 pb-4 pt-3">
          <button type="button" onClick={prev} disabled={idx === 0} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
          </button>
          <button type="button" onClick={next} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
            {idx < active.length - 1 ? (
              <>
                Lanjut <ChevronRight className="h-3.5 w-3.5" />
              </>
            ) : (
              "Selesai"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
