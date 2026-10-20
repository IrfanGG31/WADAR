"use client";

import { Loader2, PenLine, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveShopIdentity } from "./actions";

export interface Identity {
  name: string;
  owner: string;
  address: string;
}

/** Ganti nama usaha, nama pemilik/asisten, dan alamat — sebelum presentasi atau untuk tiap calon pengguna. */
export function IdentityForm({ current, original }: { current: Identity; original: Identity | null }) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Identity>(current);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const changed = form.name !== current.name || form.owner !== current.owner || form.address !== current.address;

  const save = (value: Identity) => {
    setMessage(undefined);
    startTransition(async () => {
      const r = await saveShopIdentity(slug, value);
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Tersimpan." });
      if (!r.error) router.refresh();
    });
  };

  const field = (key: keyof Identity, label: string, hint: string, placeholder: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`id-${key}`}>{label}</Label>
      <Input id={`id-${key}`} value={form[key]} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(form);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Nama usaha", "Tampil di semua halaman, struk, dan chat pembeli.", "mis. Warkop Cak Rafi")}
        {field("owner", "Nama pemilik / asisten", "Nama yang dipakai asisten saat membalas pembeli.", "mis. Cak Rafi")}
        <div className="sm:col-span-2">{field("address", "Alamat", "Dijawab asisten kalau pembeli tanya lokasi.", "Jl. …, Surabaya")}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !changed || form.name.trim().length < 2}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PenLine className="h-4 w-4" aria-hidden />}
          Simpan
        </Button>
        {original && (original.name !== current.name || original.owner !== current.owner) && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const back = { ...original, address: current.address };
              setForm(back);
              save(back);
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Kembalikan ke {original.name}
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </form>
  );
}
