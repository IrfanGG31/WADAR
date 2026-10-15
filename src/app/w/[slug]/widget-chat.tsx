"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Msg {
  id: string;
  author: "customer" | "ai" | "human" | "system";
  content: string;
}

function newClientId() {
  return `c${crypto.randomUUID().replace(/-/g, "")}`;
}

export function WidgetChat({
  slug,
  shopName,
  assistantName,
  salutation,
}: {
  slug: string;
  shopName: string;
  assistantName: string;
  salutation: string;
}) {
  const storageKey = `wadar-widget-${slug}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  const add = (list: Msg[]) =>
    setMessages((prev) => {
      const fresh = list.filter((m) => !seen.current.has(m.id));
      fresh.forEach((m) => seen.current.add(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });

  const [streaming, setStreaming] = useState(false);

  // A visitor who has written before gets the history and live admin replies over SSE.
  useEffect(() => {
    if (!streaming && !localStorage.getItem(storageKey)) return;
    const source = new EventSource(`/api/widget/${slug}/stream`);
    source.addEventListener("message", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as Msg;
      add([m]);
    });
    return () => source.close();
  }, [slug, storageKey, streaming]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    const clientId = newClientId();
    const local: Msg = { id: `local-${clientId}`, author: "customer", content: value };
    seen.current.add(local.id);
    setMessages((prev) => [...prev, local]);
    setText("");
    try {
      const res = await fetch(`/api/widget/${slug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, client_id: clientId }),
      });
      const data = (await res.json()) as { messages?: Msg[]; inbound?: Msg; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim.");
      localStorage.setItem(storageKey, "1");
      // The stored copy replaces the optimistic one, so the stream cannot show it twice.
      if (data.inbound) {
        seen.current.add(data.inbound.id);
        setMessages((prev) => prev.map((m) => (m.id === local.id ? { ...data.inbound! } : m)));
      }
      add(data.messages ?? []);
      setStreaming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim. Coba lagi ya.");
      setText(value);
      setMessages((prev) => prev.filter((m) => m.id !== local.id));
    } finally {
      setBusy(false);
    }
  }

  const greeting = `Halo ${salutation}! Aku ${assistantName} dari ${shopName}. Mau tanya produk, stok, ongkir, atau cara pesan?`;

  return (
    <>
      <header className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">{shopName}</h1>
        <p className="text-xs text-muted-foreground">Dijawab asisten toko. Kalau perlu, admin akan ikut membalas.</p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        <Bubble author="ai" content={greeting} />
        {messages.map((m) => (
          <Bubble key={m.id} author={m.author} content={m.content} />
        ))}
        {busy && <p className="text-xs text-muted-foreground">{assistantName} sedang mengetik…</p>}
        <div ref={bottom} />
      </div>
      {error && <p className="px-4 pb-1 text-sm text-destructive">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Tulis pesan…"
          aria-label="Pesan"
          className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" className="size-11" disabled={busy || !text.trim()} aria-label="Kirim">
          <Send />
        </Button>
      </form>
    </>
  );
}

function Bubble({ author, content }: { author: Msg["author"]; content: string }) {
  const mine = author === "customer";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
            : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
        }
      >
        {author === "human" && <span className="mb-0.5 block text-xs font-medium text-muted-foreground">Admin</span>}
        {content}
      </div>
    </div>
  );
}
