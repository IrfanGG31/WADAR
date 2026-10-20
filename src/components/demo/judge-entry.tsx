"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { startDemo } from "@/app/demo-actions";
import { DEMO_SHOPS, SEGMENT_PROFILES, type DemoProfile } from "@/core/demo-profiles";

function Start({ profile }: { profile: DemoProfile }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("profile") === profile;
  return (
    <button
      type="submit"
      name="profile"
      value={profile}
      disabled={pending}
      className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
    >
      {mine ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
      {mine ? "Menyiapkan toko (±5 detik)…" : "Coba toko ini"}
    </button>
  );
}

/** Public judge entry: each visitor gets a private copy of the chosen demo shop. */
export function JudgeEntry() {
  return (
    <form action={startDemo} className="grid gap-4 md:grid-cols-3">
      {SEGMENT_PROFILES.map((p) => {
        const s = DEMO_SHOPS[p];
        return (
          <div key={p} className="lift flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-3xl" aria-hidden>
              {s.emoji}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{s.segment}</p>
              <p className="text-lg font-semibold text-navy">{s.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.tagline}</p>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {s.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
            <Start profile={p} />
          </div>
        );
      })}
    </form>
  );
}
