"use client";

import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MEMORY_KIND_LABEL, MEMORY_MAX_CHARS } from "@/core/consult/memory";
import type { MemoryItem } from "@/core/consult/tools";
import { deleteMemoryItem, updateMemoryItem } from "./memory-actions";

/** "Yang WADAR tahu" (CON-4): notes saved with "Ingat ya, …", which the consultant reads; the owner can edit or delete them. */
export function MemoryList({ slug, items }: { slug: string; items: MemoryItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>, onDone?: () => void) =>
    startTransition(async () => {
      const result = await action();
      setError(result.error);
      if (!result.error) onDone?.();
      router.refresh();
    });

  return (
    <section aria-labelledby="memory-list" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 id="memory-list" className="text-base font-semibold">
          Yang WADAR tahu
        </h2>
        <p className="text-sm text-muted-foreground">Catatan yang selalu dibaca konsultan sebelum menjawab.</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada catatan. Tulis &ldquo;Ingat ya, …&rdquo; di kolom tanya.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {items.map((m) =>
            editing?.id === m.id ? (
              <li key={m.id} className="flex flex-col gap-2 p-3">
                <label htmlFor={`memory-${m.id}`} className="sr-only">
                  Ubah catatan
                </label>
                <textarea
                  id={`memory-${m.id}`}
                  value={editing.text}
                  onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                  maxLength={MEMORY_MAX_CHARS}
                  rows={2}
                  className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateMemoryItem(slug, m.id, editing.text), () => setEditing(null))}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Simpan
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
                    <X aria-hidden /> Batal
                  </Button>
                </div>
              </li>
            ) : (
              <li key={m.id} className="flex items-start gap-2 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm">{m.content}</p>
                  <Badge variant="muted" className="w-fit">
                    {MEMORY_KIND_LABEL[m.kind] ?? m.kind}
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Ubah: ${m.content}`}
                  disabled={pending}
                  onClick={() => {
                    setError(undefined);
                    setEditing({ id: m.id, text: m.content });
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus: ${m.content}`}
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Hapus catatan ini? Konsultan tidak akan membacanya lagi.")) return;
                    run(() => deleteMemoryItem(slug, m.id));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
