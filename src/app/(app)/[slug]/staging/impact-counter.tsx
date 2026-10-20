"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/core/impact";
import { formatCount } from "@/core/number-format";

export interface ImpactPart {
  label: string;
  count: number;
  minutes: number;
  note: string;
}

/** Counts up once on first view (skipped for prefers-reduced-motion). Numbers come from src/core/impact. */
function useCountUp(target: number, ms = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Part({ part }: { part: ImpactPart }) {
  const n = useCountUp(part.count);
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface p-4">
      <p className="font-display text-2xl font-extrabold tabular-nums text-navy">{formatCount(n)}</p>
      <p className="text-sm font-medium">{part.label}</p>
      <p className="text-xs text-muted-foreground">
        ≈ {formatDuration(part.minutes)} · {part.note}
      </p>
    </div>
  );
}

export function ImpactCounter({ shopName, totalMinutes, parts }: { shopName: string; totalMinutes: number; parts: ImpactPart[] }) {
  const minutes = useCountUp(totalMinutes, 1600);
  return (
    <div className="flex flex-col gap-4">
      <div className="kpi-glow rounded-2xl bg-gradient-to-br from-navy to-primary p-5 text-white">
        <p className="text-sm text-white/80">Waktu yang dihemat {shopName} minggu ini</p>
        <p className="font-display text-4xl font-extrabold tabular-nums sm:text-5xl">{formatDuration(minutes)}</p>
        <p className="mt-1 text-sm text-white/80">Waktu yang bisa dipakai melayani pembeli, bukan menulis nota dan membalas chat yang sama.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {parts.map((p) => (
          <Part key={p.label} part={p} />
        ))}
      </div>
    </div>
  );
}
