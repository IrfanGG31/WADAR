"use client";

import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveDemoTemplate } from "./actions";

export interface TemplateView {
  profile: string;
  name: string;
  owner: string;
  segment: string;
  tagline: string;
  emoji: string;
  onJuri: boolean;
}

export function TemplateForm({ template }: { template: TemplateView }) {
  const [form, setForm] = useState(template);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const id = (k: string) => `tpl-${template.profile}-${k}`;
  const set = (k: keyof TemplateView) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(undefined);
        startTransition(async () => {
          const r = await saveDemoTemplate(form);
          setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Tersimpan." });
        });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Profil: {template.profile}</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.onJuri} onChange={(e) => setForm((f) => ({ ...f, onJuri: e.target.checked }))} />
          Tampil di /juri
        </label>
      </div>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("emoji")}>Ikon</Label>
          <Input id={id("emoji")} value={form.emoji} onChange={set("emoji")} className="text-center text-lg" maxLength={8} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("name")}>Nama toko</Label>
          <Input id={id("name")} value={form.name} onChange={set("name")} maxLength={60} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("owner")}>Nama pemilik / asisten</Label>
          <Input id={id("owner")} value={form.owner} onChange={set("owner")} maxLength={30} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("segment")}>Jenis usaha</Label>
          <Input id={id("segment")} value={form.segment} onChange={set("segment")} maxLength={40} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("tagline")}>Deskripsi singkat</Label>
        <Input id={id("tagline")} value={form.tagline} onChange={set("tagline")} maxLength={160} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Simpan
        </Button>
        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
