"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KB_STATUS_LABEL } from "@/core/chat/kb";
import { docFileProblem, MAX_DOC_CHARS } from "@/core/chat/kb-doc";
import { formatCount } from "@/core/number-format";
import type { DocRow } from "@/db/kb";
import { cn } from "@/lib/utils";
import { addDocument, deleteDocument } from "./actions";

/** KB-2: add a document (file .txt or pasted text) and see each one's state. */
export function DocManager({ docs }: { docs: DocRow[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  async function pickFile(file: File | undefined) {
    setMessage(undefined);
    if (!file) return;
    const problem = docFileProblem(file.name, file.size);
    if (problem) return setMessage({ ok: false, text: problem });
    setText(await file.text());
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 120));
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(undefined);
          startTransition(async () => {
            const r = await addDocument(slug, { title, text });
            if (r.error) return setMessage({ ok: false, text: r.error });
            setMessage({ ok: true, text: r.note ?? "Dokumen siap dipakai asisten chat." });
            setTitle("");
            setText("");
            router.refresh();
          });
        }}
      >
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5 text-primary" aria-hidden />
          Tambah dokumen
        </h2>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Isi dokumen bisa dikutip asisten ke pembeli. Jangan masukkan harga modal, HPP, atau data internal lain.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-title">Judul</Label>
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="mis. Panduan ukuran baju" />
        </div>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 px-4 text-sm font-medium text-primary hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary">
          <Upload className="h-4 w-4" aria-hidden />
          Ambil dari file .txt
          <input type="file" accept=".txt,.md,text/plain" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-text">Isi</Label>
          <textarea
            id="doc-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Tempel isi dokumen di sini: cara pemakaian, panduan ukuran, SOP pengiriman, garansi…"
            className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          />
          <p className={cn("text-xs", text.length > MAX_DOC_CHARS ? "text-destructive" : "text-muted-foreground")}>
            {formatCount(text.length)} / {formatCount(MAX_DOC_CHARS)} huruf
          </p>
        </div>
        <Button type="submit" size="lg" disabled={pending || title.trim().length < 3 || text.trim().length < 20}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Memproses…" : "Simpan dokumen"}
        </Button>
        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
            {message.text}
          </p>
        )}
      </form>

      <section className="flex flex-col gap-2" aria-labelledby="daftar-dokumen">
        <h2 id="daftar-dokumen" className="font-semibold">Dokumen ({formatCount(docs.length)})</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada dokumen.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {docs.map((d) => (
              <DocItem key={d.id} doc={d} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocItem({ doc }: { doc: DocRow }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const tone = doc.status === "ready" ? (doc.error ? "warning" : "success") : doc.status === "failed" ? "danger" : "outline";
  return (
    <li className="flex flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">{formatCount(doc.chunks)} bagian</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={tone}>{KB_STATUS_LABEL[doc.status]}</Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Hapus ${doc.title}`}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteDocument(slug, doc.id);
                if (r.error) return setError(r.error);
                router.refresh();
              })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      {doc.error && <p className="text-xs text-muted-foreground">{doc.error}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
