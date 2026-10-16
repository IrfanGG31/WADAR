"use client";

import { Brain, Loader2, Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDeepQuestion } from "@/core/consult/question";
import { readConsultStream, type Message } from "./consult-stream";

const SUGGESTIONS = [
  "Berapa penjualan hari ini?",
  "Kenapa untungku turun minggu ini?",
  "Stok apa yang harus segera dipesan?",
  "Kanal mana yang margin-nya paling tipis?",
  "Siapa pelanggan terbaikku?",
];

const OFFLINE_REASON: Record<string, string> = {
  no_api_key: "belum ada kunci Gemini di server ini",
  demo_safe: "mode DEMO_SAFE aktif",
  circuit_open: "model sedang dihentikan sementara (gangguan berulang)",
  timeout: "model terlalu lama menjawab",
  provider_error: "model gagal menjawab",
  no_provider: "model belum dikonfigurasi",
};

const GROUNDING_LABEL: Record<string, string> = {
  model: "Angka sudah dicocokkan dengan data",
  regenerated: "Angka dikoreksi sekali, lalu cocok dengan data",
  template: "Jawaban model ditolak (angka tak cocok) — diganti ringkasan dari data",
  offline: "Ringkasan templat dari data tokomu",
};

export function ConsultClient({ slug, offlineReason }: { slug: string; offlineReason: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);

  const patch = (id: number, p: Partial<Message>) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const scroll = () => queueMicrotask(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

  async function stream(payload: Record<string, unknown>, id: number) {
    const res = await fetch("/api/consult", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, ...payload }) });
    // A signed-out request is redirected to the login page (HTML), not answered with a stream.
    if (res.ok && !res.headers.get("content-type")?.includes("ndjson")) throw new Error("Sesi berakhir. Silakan masuk lagi.");
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "Konsultan tidak bisa dihubungi.");
    }
    await readConsultStream(res.body, (p) => {
      patch(id, p);
      scroll();
    });
  }

  async function run(userText: string | null, payload: Record<string, unknown>, question?: string) {
    if (busy) return;
    setBusy(true);
    const assistantId = nextId.current++;
    setMessages((ms) => [
      ...ms,
      ...(userText ? [{ id: nextId.current++, role: "user" as const, text: userText }] : []),
      { id: assistantId, role: "assistant", text: "", status: "Menghubungi konsultan…", question },
    ]);
    scroll();
    try {
      await stream(payload, assistantId);
    } catch (e) {
      patch(assistantId, { text: e instanceof Error ? e.message : "Terjadi kesalahan.", error: true, status: undefined, draft: false });
    } finally {
      setBusy(false);
    }
  }

  const history = () =>
    messages
      .filter((m) => !m.error && !m.draft && m.text && !m.remember)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));

  function ask(question: string, deep = false) {
    const q = question.trim();
    if (q.length < 2) return;
    setInput("");
    void run(deep ? null : q, { action: "ask", question: q, history: history(), deep }, q);
  }

  async function confirmRemember(m: Message, save: boolean) {
    if (!m.remember) return;
    if (!save) return patch(m.id, { remember: { ...m.remember, state: "skipped" } });
    patch(m.id, { remember: { ...m.remember, state: "saved" } });
    await run(null, { action: "remember", content: m.remember.content });
  }

  return (
    <div className="flex flex-col gap-4">
      {offlineReason ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <strong>Mode offline</strong> — {OFFLINE_REASON[offlineReason] ?? offlineReason}. Jawaban disusun dari templat dan data tokomu, bukan oleh model AI.
        </p>
      ) : null}

      <Button variant="outline" className="justify-start gap-2" disabled={busy} onClick={() => void run(null, { action: "weekly" })}>
        <Sparkles className="h-4 w-4 text-primary" />
        Insight minggu ini
      </Button>

      {messages.length === 0 ? (
        <section className="flex flex-col gap-2" aria-label="Contoh pertanyaan">
          <p className="text-sm text-muted-foreground">Tanya apa saja soal tokomu, misalnya:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => ask(s)}
                className="min-h-11 rounded-full border border-border px-4 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <ul className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                    : `max-w-[92%] rounded-2xl rounded-bl-sm border px-4 py-3 text-sm ${m.error ? "border-red-300 bg-red-50 text-red-900" : "border-border"}`
                }
              >
                {m.status ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {m.status}
                  </p>
                ) : null}
                {m.text ? <p className={`whitespace-pre-line ${m.draft ? "text-muted-foreground" : ""}`}>{m.text}</p> : null}

                {m.remember?.state === "pending" ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void confirmRemember(m, true)}>
                      Simpan
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void confirmRemember(m, false)}>
                      Jangan
                    </Button>
                  </div>
                ) : null}

                {m.meta && !m.draft ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={m.meta.engine === "llm" ? "default" : "muted"}>
                        {m.meta.engine === "llm" ? `AI · ${m.meta.model}` : "Offline · templat"}
                      </Badge>
                      {m.meta.cached ? <span className="text-xs text-muted-foreground">Jawaban tersimpan · data belum berubah</span> : null}
                      {m.meta.grounding && GROUNDING_LABEL[m.meta.grounding] ? (
                        <span className="text-xs text-muted-foreground">{GROUNDING_LABEL[m.meta.grounding]}</span>
                      ) : null}
                    </div>
                    {m.meta.engine === "offline" && m.meta.fallbackReason ? (
                      <p className="text-xs text-muted-foreground">Alasan: {OFFLINE_REASON[m.meta.fallbackReason] ?? m.meta.fallbackReason}.</p>
                    ) : null}
                    {m.question && m.meta.tier === "consult_fast" && isDeepQuestion(m.question) ? (
                      <Button size="sm" variant="outline" className="w-fit gap-2" disabled={busy} onClick={() => ask(m.question!, true)}>
                        <Brain className="h-4 w-4" />
                        Analisis mendalam
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
          <div ref={bottom} />
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya soal penjualan, untung, stok…"
          maxLength={600}
          aria-label="Pertanyaan"
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy || input.trim().length < 2} aria-label="Kirim">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Tulis &ldquo;Ingat ya, …&rdquo; untuk menyimpan catatan atau aturan tokomu. Konsultan hanya membaca datamu, tidak mengubah apa pun.
      </p>
    </div>
  );
}
