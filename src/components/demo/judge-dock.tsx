"use client";

import { Compass, FlaskConical, Info, MoreHorizontal, X } from "lucide-react";
import { Dialog } from "radix-ui";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { currentPage } from "@/components/shell/nav-items";
import { shopPath } from "@/lib/routes";
import { FeatureTour } from "./feature-tour";
import { PitchCard } from "./pitch-card";

export const TOUR_PARAM = "tur";

const HINT_KEY = "wadar-tour-hint-seen";

/**
 * "Tur Demo Interaktif" (demo shops only): a large floating button that starts the feature tour
 * at once, plus a small "more" button for the 30-second pitch and Ruang Demo. Until the visitor
 * has used it once, a hint bubble and a soft pulse point at it. Hidden on real shops.
 */
export function JudgeDock() {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [tour, setTour] = useState(false);
  const [pitch, setPitch] = useState(false);
  const [hint, setHint] = useState(false);
  const page = currentPage(pathname);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        setHint(window.localStorage.getItem(HINT_KEY) !== "1");
      } catch {
        setHint(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const dismissHint = () => {
    setHint(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      // private mode: the hint simply shows again next visit
    }
  };

  useEffect(() => {
    if (search.get(TOUR_PARAM) !== "1" || page !== "beranda") return;
    // Let the streamed Beranda sections land before measuring them.
    const t = window.setTimeout(() => setTour(true), 900);
    return () => window.clearTimeout(t);
  }, [search, page]);

  const closeTour = useCallback(() => {
    setTour(false);
    if (search.get(TOUR_PARAM)) router.replace(shopPath(slug, "beranda"), { scroll: false });
  }, [router, search, slug]);

  const startTour = () => {
    setMenu(false);
    dismissHint();
    if (page === "beranda") setTour(true);
    else router.push(`${shopPath(slug, "beranda")}?${TOUR_PARAM}=1`);
  };

  return (
    <>
      <div className="fixed bottom-20 right-3 z-50 flex flex-col items-end gap-2 md:bottom-6 md:right-6">
        {menu && (
          <div className="dock-in flex w-64 flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-xl">
            <button type="button" onClick={startTour} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-muted">
              <Compass className="h-5 w-5 text-primary" aria-hidden /> Tur demo interaktif
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setPitch(true);
              }}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-muted"
            >
              <Info className="h-5 w-5 text-primary" aria-hidden /> Tentang WADAR
            </button>
            <Link
              href={shopPath(slug, "staging")}
              onClick={() => setMenu(false)}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium hover:bg-muted"
            >
              <FlaskConical className="h-5 w-5 text-primary" aria-hidden /> Ruang Demo
            </Link>
          </div>
        )}
        {hint && !menu && !tour && (
          <div className="dock-in relative max-w-[16rem] rounded-2xl bg-navy px-4 py-3 text-sm text-white shadow-xl">
            <button type="button" onClick={dismissHint} className="absolute right-1.5 top-1.5 rounded-full p-1 text-white/70 hover:text-white" aria-label="Tutup petunjuk">
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-4 font-semibold">👋 Baru pertama di sini?</p>
            <p className="text-white/80">Ikuti tur 1 menit: saya tunjukkan fitur utama satu per satu.</p>
            <span className="absolute -bottom-1.5 right-10 h-3 w-3 rotate-45 bg-navy" aria-hidden />
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label={menu ? "Tutup menu demo" : "Menu demo lainnya"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-navy shadow-lg ring-1 ring-border hover:bg-muted"
          >
            {menu ? <X className="h-5 w-5" aria-hidden /> : <MoreHorizontal className="h-5 w-5" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={startTour}
            className={`flex h-14 items-center gap-3 rounded-full bg-gradient-to-r from-primary to-sky pl-3 pr-6 text-left text-white shadow-xl shadow-primary/40 ring-4 ring-white transition-transform hover:scale-[1.03] active:scale-95 ${hint ? "tour-attention" : ""}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Compass className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold">Tur Demo Interaktif</span>
              <span className="text-xs text-white/85">1 menit · klik untuk mulai</span>
            </span>
          </button>
        </div>
      </div>

      <FeatureTour open={tour} onClose={closeTour} />

      <Dialog.Root open={pitch} onOpenChange={setPitch}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[95] bg-navy/50 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[96] max-h-[88dvh] w-[min(46rem,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl sm:p-6">
            <Dialog.Title className="sr-only">Tentang WADAR</Dialog.Title>
            <Dialog.Description className="sr-only">Ringkasan masalah, solusi, pasar, dan rencana WADAR.</Dialog.Description>
            <Dialog.Close className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Tutup">
              <X className="h-4 w-4" />
            </Dialog.Close>
            <PitchCard />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
