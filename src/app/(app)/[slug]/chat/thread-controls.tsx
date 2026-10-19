"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendMessage, returnToAi, sendReply, takeOver } from "./actions";

/** Refreshes the thread while it is open so new buyer messages appear without a reload. */
export function AutoRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function ThreadControls({ slug, conversationId, mode }: { slug: string; conversationId: string; mode: "ai" | "human" }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; warning?: string }>, after?: () => void) {
    setError(undefined);
    setWarning(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else after?.();
      if (result.warning) setWarning(result.warning);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {mode === "ai" ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => takeOver(slug, conversationId))}>
            Ambil alih
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => returnToAi(slug, conversationId))}>
            Kembalikan ke AI
          </Button>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          run(() => sendReply(slug, conversationId, { text }), () => setText(""));
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={700}
          placeholder="Tulis balasan untuk pembeli…"
          aria-label="Balasan"
          className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0 self-end" disabled={pending || !text.trim()} aria-label="Kirim balasan">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {warning && <p role="status" className="text-sm text-amber-800">{warning}</p>}
      {mode === "ai" && <p className="text-xs text-muted-foreground">Mengirim balasan otomatis mengambil alih percakapan ini dari AI.</p>}
    </div>
  );
}

/** Under a reply that did not reach the buyer's Telegram/WhatsApp: why, and one more try. */
export function DeliveryFailed({ slug, messageId, reason }: { slug: string; messageId: string; reason: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const why = error ?? reason;
  return (
    <div className="mt-1 flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-destructive">
      <span>Belum terkirim{why ? `: ${why}` : ""}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await resendMessage(slug, messageId);
            setError(r.error);
            router.refresh();
          })
        }
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      >
        {pending && <Loader2 className="size-3 animate-spin" aria-hidden />} Kirim ulang
      </button>
    </div>
  );
}
