"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { startDemo } from "@/app/demo-actions";
import type { DemoProfile } from "@/core/demo-profiles";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface VariantView {
  profile: DemoProfile;
  name: string;
  segment: string;
  emoji: string;
  tagline: string;
  highlights: string[];
  /** The user's existing demo shop of this profile, if any. */
  slug: string | null;
}

function Open({ v, current }: { v: VariantView; current: boolean }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("profile") === v.profile;
  const cls = "mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold";
  if (current) {
    return (
      <span className={cn(cls, "bg-success/10 text-success")}>
        <Check className="h-4 w-4" aria-hidden /> Sedang dibuka
      </span>
    );
  }
  if (v.slug) {
    return (
      <Link href={shopPath(v.slug, "beranda")} className={cn(cls, "bg-primary text-primary-foreground hover:bg-primary-hover")}>
        Buka toko <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  return (
    <button type="submit" name="profile" value={v.profile} disabled={pending} className={cn(cls, "bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60")}>
      {mine ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
      {mine ? "Menyiapkan toko…" : "Buat & buka"}
    </button>
  );
}

function Card({ v, current }: { v: VariantView; current: boolean }) {
  return (
    <div className={cn("lift flex flex-col gap-3 rounded-2xl border p-4", current ? "border-primary ring-2 ring-primary/20" : "border-border")}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-2xl" aria-hidden>
          {v.emoji}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{v.segment}</p>
          <p className="truncate font-semibold text-navy">{v.name}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{v.tagline}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {v.highlights.map((h) => (
          <li key={h} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            {h}
          </li>
        ))}
      </ul>
      <Open v={v} current={current} />
    </div>
  );
}

/** Three segment demos first, the two long-story shops below. A new demo shop is built by `startDemo` (rate limited). */
export function VariantPicker({ current, segments, others }: { current: DemoProfile | null; segments: VariantView[]; others: VariantView[] }) {
  return (
    <form action={startDemo} className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {segments.map((v) => (
          <Card key={v.profile} v={v} current={current === v.profile} />
        ))}
      </div>
      <details className="rounded-xl bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-navy">Toko demo lengkap (90 hari data)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {others.map((v) => (
            <Card key={v.profile} v={v} current={current === v.profile} />
          ))}
        </div>
      </details>
    </form>
  );
}
