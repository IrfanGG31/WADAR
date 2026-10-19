"use client";

import { Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AgentSettings } from "@/core/agent";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { runAgentNow, saveAgentSettings } from "./agent-actions";

const SWITCHES: { key: keyof AgentSettings; title: string; hint: string }[] = [
  { key: "auto_reply", title: "AI membalas chat pembeli", hint: "Dari produk, info toko, FAQ, dan dokumen. Yang tidak ia tahu diteruskan ke kamu." },
  { key: "auto_reorder", title: "Siapkan pesanan ulang ke pemasok", hint: "Tiap pagi: produk yang akan habis + jumlah yang disarankan + pesan WA siap kirim." },
  { key: "auto_faq", title: "Usulkan FAQ dari chat yang belum terjawab", hint: "Pertanyaan yang membuat AI menyerah jadi daftar FAQ untuk kamu isi jawabannya." },
];

export function AgentSettingsForm({ settings, openTasks }: { settings: AgentSettings; openTasks: number }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [value, setValue] = useState(settings);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  function save(next: AgentSettings) {
    setValue(next);
    setMessage(undefined);
    startTransition(async () => {
      const r = await saveAgentSettings(slug, next);
      if (r.error) {
        setValue(value);
        setMessage({ ok: false, text: r.error });
      } else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-4 rounded-xl bg-navy p-4 text-white">
        <span className="flex flex-col">
          <span className="font-semibold">Autopilot</span>
          <span className="text-sm text-white/70">Agent bekerja tiap pagi pukul 06.00 dan saat kamu menekan &ldquo;Jalankan sekarang&rdquo;.</span>
        </span>
        <input type="checkbox" className="h-6 w-6 accent-sky" checked={value.enabled} disabled={pending} onChange={(e) => save({ ...value, enabled: e.target.checked })} />
      </label>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {SWITCHES.map((s) => (
          <li key={s.key}>
            <label className={cn("flex min-h-16 items-center justify-between gap-4 p-4", !value.enabled && s.key !== "auto_reply" && "opacity-60")}>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-primary"
                checked={value[s.key]}
                disabled={pending}
                onChange={(e) => save({ ...value, [s.key]: e.target.checked })}
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || !value.enabled}
          onClick={() =>
            startTransition(async () => {
              const r = await runAgentNow(slug);
              setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Selesai." });
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          Jalankan sekarang
        </Button>
        <Button asChild variant="ghost">
          <Link href={shopPath(slug, "autopilot")}>Lihat yang disiapkan ({openTasks})</Link>
        </Button>
      </div>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
