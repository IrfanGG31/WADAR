"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEBHOOK_EVENT_LABEL, WEBHOOK_EVENTS, type WebhookEvent } from "@/core/webhooks";
import { cn } from "@/lib/utils";
import { createWebhook, deleteWebhook, testWebhook, type WebhookActionResult } from "./webhook-actions";

export interface WebhookView {
  id: string;
  url: string;
  events: string[];
  status_label: string | null;
  last_error: string | null;
}

/** Webhook keluar: WADAR posts signed events to the owner's app (n8n, Make, Zapier, a server). */
export function WebhookManager({ endpoints }: { endpoints: WebhookView[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["sale.created"]);
  const [secret, setSecret] = useState<string>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<WebhookActionResult>, onOk?: (r: WebhookActionResult) => void) {
    setMessage(undefined);
    startTransition(async () => {
      const r = await fn();
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Selesai." });
      if (!r.error) onOk?.(r);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {endpoints.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {endpoints.map((w) => (
            <li key={w.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{w.url}</p>
                <p className="text-xs text-muted-foreground">{w.events.map((e) => WEBHOOK_EVENT_LABEL[e as WebhookEvent] ?? e).join(" · ")}</p>
                {(w.status_label || w.last_error) && (
                  <p className={cn("text-xs", w.last_error ? "text-destructive" : "text-emerald-700")}>{w.last_error ?? w.status_label}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => testWebhook(slug, w.id))}>
                  Tes
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteWebhook(slug, w.id))}>
                  Hapus
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createWebhook(slug, { url, events }), (r) => {
            setSecret(r.secret);
            setUrl("");
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hook-url">Alamat penerima (https)</Label>
          <Input id="hook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/…" inputMode="url" autoComplete="off" />
        </div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-sm font-medium">Kirim saat</legend>
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={events.includes(ev)}
                onChange={(e) => setEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))}
              />
              {WEBHOOK_EVENT_LABEL[ev]}
            </label>
          ))}
        </fieldset>
        <Button type="submit" variant="outline" className="w-fit" disabled={pending || !url.trim() || events.length === 0}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Tambah webhook
        </Button>
        {secret && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs">{secret}</code>
            <CopyButton text={secret} label="Salin rahasia" />
          </div>
        )}
        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
            {message.text}
          </p>
        )}
      </form>
    </div>
  );
}
