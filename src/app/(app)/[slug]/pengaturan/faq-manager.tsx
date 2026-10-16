"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KB_STATUS_LABEL } from "@/core/chat/kb";
import type { FaqRow } from "@/db/kb";
import { addFaq, deleteFaq } from "./actions";

const STATUS_VARIANT = { processing: "warning", ready: "success", failed: "danger" } as const;

function honestFaqNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  return note.replace(/\s*Pencarian makna aktif setelah kunci AI dipasang\.?/gi, "").trim() || undefined;
}

export function FaqManager({ slug, faqs }: { slug: string; faqs: FaqRow[] }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState<{ error?: string; note?: string }>();
  const [pending, startTransition] = useTransition();
  const displayNote = honestFaqNote(message?.note);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">FAQ untuk asisten</h2>
        <p className="text-sm text-muted-foreground">
          Pertanyaan yang sering ditanya pembeli. Dicari asisten lewat kata kunci dan dibaca pembeli, jadi jangan tulis modal atau margin.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await addFaq(slug, { question, answer });
            setMessage(result);
            if (!result.error) {
              setQuestion("");
              setAnswer("");
            }
            router.refresh();
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="faq-q">Pertanyaan</Label>
          <Input id="faq-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} placeholder="Apakah produk sudah BPOM?" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="faq-a">Jawaban</Label>
          <textarea
            id="faq-a"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={700}
            rows={3}
            className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          />
        </div>
        <Button type="submit" disabled={pending || !question.trim() || !answer.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Tambah FAQ
        </Button>
        {message?.error && (
          <p role="alert" className="text-sm text-red-800">
            {message.error}
          </p>
        )}
        {displayNote && (
          <p role="status" className="text-sm text-muted-foreground">
            {displayNote}
          </p>
        )}
      </form>

      {faqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada FAQ.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {faqs.map((f) => (
            <li key={f.id} className="flex items-start gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm font-medium">{f.question}</p>
                <p className="text-sm text-muted-foreground">{f.answer}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[f.status]}>{KB_STATUS_LABEL[f.status]}</Badge>
                  {f.status === "ready" && <span className="text-xs text-muted-foreground">Dicari lewat kata kunci</span>}
                  {f.error && <span className="text-xs text-red-800">{f.error}</span>}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Hapus FAQ: ${f.question}`}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Hapus FAQ ini?")) return;
                  startTransition(async () => {
                    setMessage(await deleteFaq(slug, f.id));
                    router.refresh();
                  });
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
