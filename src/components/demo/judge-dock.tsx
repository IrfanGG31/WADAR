"use client";

import { Compass, FlaskConical, Info, Sparkles, X } from "lucide-react";
import { Dialog } from "radix-ui";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { currentPage } from "@/components/shell/nav-items";
import { shopPath } from "@/lib/routes";
import { FeatureTour } from "./feature-tour";
import { PitchCard } from "./pitch-card";

export const TOUR_PARAM = "tur";

/**
 * "Mode Juri" (demo shops only): one floating button with the feature tour, the 30-second
 * pitch, and the way into Ruang Demo. Hidden on real shops, so nothing changes for owners.
 */
export function JudgeDock() {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [tour, setTour] = useState(false);
  const [pitch, setPitch] = useState(false);
  const page = currentPage(pathname);

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
    if (page === "beranda") setTour(true);
    else router.push(`${shopPath(slug, "beranda")}?${TOUR_PARAM}=1`);
  };

  return (
    <>
      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2 md:bottom-6 md:right-6">
        {menu && (
          <div className="dock-in flex w-56 flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-xl">
            <button type="button" onClick={startTour} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm font-medium hover:bg-muted">
              <Compass className="h-4 w-4 text-primary" aria-hidden /> Tur fitur (1 menit)
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setPitch(true);
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm font-medium hover:bg-muted"
            >
              <Info className="h-4 w-4 text-primary" aria-hidden /> Tentang WADAR
            </button>
            <Link
              href={shopPath(slug, "staging")}
              onClick={() => setMenu(false)}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-muted"
            >
              <FlaskConical className="h-4 w-4 text-primary" aria-hidden /> Ruang Demo
            </Link>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-primary to-sky px-5 text-sm font-semibold text-white shadow-lg shadow-primary/30 ring-2 ring-white transition-transform hover:scale-[1.03] active:scale-95"
        >
          {menu ? <X className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          Mode Juri
        </button>
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
