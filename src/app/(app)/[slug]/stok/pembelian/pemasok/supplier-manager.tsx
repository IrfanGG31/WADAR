"use client";

import { Loader2, MessageCircle, Pencil } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone } from "@/core/phone";
import { cn } from "@/lib/utils";
import { archiveSupplier, saveSupplier } from "../actions";

interface Supplier {
  id: string;
  name: string;
  phone_e164: string | null;
  note: string | null;
}

const EMPTY = { name: "", phone: "", note: "" };

export function SupplierManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  function edit(s: Supplier | null) {
    setMessage(undefined);
    setEditing(s?.id ?? null);
    setForm(s ? { name: s.name, phone: s.phone_e164 ? formatPhone(s.phone_e164) : "", note: s.note ?? "" } : EMPTY);
  }

  function run(fn: () => Promise<{ error?: string; note?: string }>, after?: () => void) {
    setMessage(undefined);
    startTransition(async () => {
      const r = await fn();
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Tersimpan." });
      if (!r.error) after?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-3 rounded-2xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSupplier(slug, editing, form), () => edit(null));
        }}
      >
        <p className="font-semibold text-navy">{editing ? "Ubah pemasok" : "Tambah pemasok"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-name">Nama</Label>
            <Input id="sup-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CV Kosmetik Jaya" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-phone">No. WhatsApp</Label>
            <Input id="sup-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0812-3456-7890" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="sup-note">Catatan (opsional)</Label>
            <Input id="sup-note" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Kirim tiap Senin, minimal order 10 pcs" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !form.name.trim()}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {editing ? "Simpan" : "Tambah"}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={() => edit(null)}>
              Batal
            </Button>
          )}
        </div>
        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
            {message.text}
          </p>
        )}
      </form>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada pemasok.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {suppliers.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.phone_e164 ? formatPhone(s.phone_e164) : "Tanpa nomor"}
                  {s.note ? ` · ${s.note}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.phone_e164 && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`https://wa.me/${s.phone_e164.replace(/^\+/, "")}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" aria-hidden /> Chat
                    </a>
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => edit(s)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Ubah
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => archiveSupplier(slug, s.id))}>
                  Hapus
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
