import { CheckCircle2, ChevronRight, Circle, MessageCircle } from "lucide-react";
import Link from "next/link";
import { setupProgress, setupSteps } from "@/core/onboarding";
import { can } from "@/core/roles";
import { getMyRole } from "@/db/access";
import { getSetupState } from "@/db/onboarding";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { HideSetupButton } from "./hide-setup-button";

/** ONB-2: "Siapkan tokomu" on Beranda for the owner until every step is done or they hide it. */
export async function SetupChecklist({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  if (shop.is_demo) return null;
  const role = await getMyRole(shop.id);
  if (!can(role, "settings")) return null;
  const { hiddenAt, facts } = await getSetupState(shop.id);
  if (hiddenAt) return null;
  const steps = setupSteps(facts);
  const progress = setupProgress(steps);
  if (progress.complete) return null;
  const next = steps.find((s) => !s.done);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="siapkan-toko">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="siapkan-toko" className="font-semibold">Siapkan tokomu</h2>
          <p className="text-sm text-muted-foreground">
            {progress.done} dari {progress.total} langkah selesai. Angka untung dan jawaban asisten makin tepat tiap langkah.
          </p>
        </div>
        <HideSetupButton />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
      </div>
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={shopPath(slug, s.page)}
              className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-current={s === next ? "step" : undefined}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Selesai" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Belum" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={s.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
                  {i + 1}. {s.title}
                </span>
                {!s.done && <span className="text-xs text-muted-foreground">{s.hint}</span>}
              </span>
              {!s.done && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href={shopPath(slug, "pengaturan/integrasi")}
            className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">Hubungkan WhatsApp & Telegram</span>
              <span className="text-xs text-muted-foreground">Menyusul. Sementara bagikan tautan chat toko dari Pengaturan.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      </ol>
    </section>
  );
}
