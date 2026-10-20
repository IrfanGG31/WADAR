"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { renameShop } from "./actions";

/** Inline rename of one shop (admin only; the RPC re-checks and writes the shop's audit log). */
export function ShopRenameRow({ id, name, slug }: { id: string; name: string; slug: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="font-medium text-navy">{name}</p>
          <p className="font-mono text-xs text-muted-foreground">/{slug}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Ganti nama ${name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const r = await renameShop({ tenantId: id, name: value });
          if (r.error) setError(r.error);
          else {
            setEditing(false);
            router.refresh();
          }
        });
      }}
    >
      <div className="flex items-center gap-1">
        <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} autoFocus aria-label="Nama toko baru" className="h-9" />
        <button type="submit" disabled={pending} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-label="Simpan">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Batal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
