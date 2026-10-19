"use client";

import { BookmarkPlus, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addFaq } from "../pengaturan/actions";

/**
 * CHT-7: turn a buyer's question into an FAQ in one tap — question and the reply that followed are
 * prefilled; the owner checks the answer, then the AI uses it for the next buyer who asks.
 */
export function MakeFaq({ slug, question, answer }: { slug: string; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(question);
  const [a, setA] = useState(answer);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  if (message?.ok) return <p className="mt-1 text-xs font-medium text-emerald-700">{message.text}</p>;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
        Jadikan FAQ
      </button>
    );
  }
  return (
    <form
      className="mt-2 flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addFaq(slug, { question: q, answer: a });
          setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: result.note ?? "Tersimpan di FAQ. AI akan memakai jawaban ini." });
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="faq-q" className="text-xs">Pertanyaan</Label>
        <Input id="faq-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="faq-a" className="text-xs">Jawaban</Label>
        <textarea
          id="faq-a"
          value={a}
          onChange={(e) => setA(e.target.value)}
          maxLength={700}
          rows={3}
          placeholder="Tulis jawaban yang benar"
          className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || q.trim().length < 5 || a.trim().length < 2}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan ke FAQ
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
      {message && <p className="text-xs text-destructive">{message.text}</p>}
    </form>
  );
}
