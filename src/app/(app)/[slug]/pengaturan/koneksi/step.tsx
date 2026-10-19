import { CheckCircle2, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "ready" | "todo" | "later";

const STATE_LABEL: Record<StepState, string> = {
  done: "Tersambung",
  ready: "Siap dipakai",
  todo: "Belum diatur",
  later: "Menyusul",
};
const STATE_TONE: Record<StepState, string> = {
  done: "bg-emerald-100 text-emerald-800",
  ready: "bg-sky/15 text-primary",
  todo: "bg-amber-100 text-amber-900",
  later: "bg-muted text-muted-foreground",
};

/** One numbered step of Pusat Koneksi: what it is, why, a tutorial to expand, then the controls. */
export function Step({
  n,
  id,
  title,
  why,
  state,
  tutorial,
  children,
}: {
  n: number;
  id: string;
  title: string;
  why: string;
  state: StepState;
  tutorial?: readonly ReactNode[];
  children?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-border p-5 sm:p-6" aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            state === "done" ? "bg-emerald-600 text-white" : "bg-navy text-white",
          )}
          aria-hidden
        >
          {state === "done" ? <CheckCircle2 className="h-5 w-5" /> : n}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-title`} className="text-lg font-semibold text-navy">
              {title}
            </h2>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATE_TONE[state])}>{STATE_LABEL[state]}</span>
          </div>
          <p className="text-sm text-muted-foreground">{why}</p>
        </div>
      </div>
      {tutorial && tutorial.length > 0 && (
        <details className="group mt-4 rounded-xl bg-surface p-4 sm:ml-13">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-navy">
            Cara menyambungkan ({tutorial.length} langkah)
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ol className="mt-3 flex flex-col gap-2.5">
            {tutorial.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-primary ring-1 ring-border">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{t}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {children && <div className="mt-5 sm:ml-13">{children}</div>}
    </section>
  );
}
