"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_PRESETS } from "@/core/channels/ai-provider";
import { cn } from "@/lib/utils";
import { removeAiProvider, saveAiProvider, setAiProviderEnabled, testAiProvider } from "./ai-actions";

export interface AiProviderView {
  base_url: string;
  chat_model: string;
  api_key_hint: string;
  enabled: boolean;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  last_test_label: string | null;
}

/** Otak AI: pick a provider (fills the base URL), paste key + model, "Tes & simpan". */
export function AiProviderForm({ current }: { current: AiProviderView | null }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const initialPreset = AI_PRESETS.find((p) => p.baseUrl && p.baseUrl === current?.base_url)?.key ?? (current ? "custom" : "openai");
  const [preset, setPreset] = useState(initialPreset);
  const [baseUrl, setBaseUrl] = useState(current?.base_url ?? AI_PRESETS[0]!.baseUrl);
  const [model, setModel] = useState(current?.chat_model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const chosen = AI_PRESETS.find((p) => p.key === preset) ?? AI_PRESETS[0]!;

  function run(fn: () => Promise<{ error?: string; note?: string }>) {
    setMessage(undefined);
    startTransition(async () => {
      const r = await fn();
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Tersimpan." });
      if (!r.error) {
        setApiKey("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {current && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {current.enabled ? "Aktif" : "Dimatikan"} · <span className="font-mono">{current.chat_model}</span>
            </p>
            <p className="truncate text-muted-foreground">
              {current.base_url} · key {current.api_key_hint}
            </p>
            {current.last_test_label && (
              <p className={cn("text-xs", current.last_test_ok ? "text-emerald-700" : "text-destructive")}>
                {current.last_test_ok ? "Tes terakhir berhasil" : `Tes terakhir gagal: ${current.last_test_error ?? ""}`} · {current.last_test_label}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => testAiProvider(slug))}>
              Tes ulang
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => setAiProviderEnabled(slug, !current.enabled))}>
              {current.enabled ? "Matikan" : "Aktifkan"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeAiProvider(slug))}>
              Hapus
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveAiProvider(slug, { base_url: baseUrl, chat_model: model, api_key: apiKey }));
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Penyedia</legend>
          <div className="flex flex-wrap gap-2">
            {AI_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={preset === p.key}
                onClick={() => {
                  setPreset(p.key);
                  if (p.baseUrl) setBaseUrl(p.baseUrl);
                }}
                className={cn(
                  "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  preset === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          {chosen.keyUrl && (
            <a href={chosen.keyUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ambil API key {chosen.name} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="ai-base">Base URL</Label>
            <Input id="ai-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" inputMode="url" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-model">Nama model</Label>
            <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="salin dari daftar model" autoComplete="off" />
            <p className="text-xs text-muted-foreground">{chosen.modelHint}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-key">API key</Label>
            <Input
              id="ai-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={current ? `Kosongkan untuk tetap pakai ${current.api_key_hint}` : "tempel di sini"}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Disimpan terenkripsi. Tidak bisa dilihat lagi, termasuk oleh kamu.</p>
          </div>
        </div>
        <Button type="submit" size="lg" disabled={pending || !baseUrl.trim() || !model.trim() || (!current && !apiKey.trim())}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Mengetes koneksi…" : "Tes & simpan"}
        </Button>
        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
            {message.text}
          </p>
        )}
      </form>
    </div>
  );
}
