"use client";

import { Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BlockedShop } from "@/core/account-deletion";
import { shopPath } from "@/lib/routes";
import { deleteMyAccount } from "../../account-actions";

/** Hapus akun, two steps: open the panel, then type the email (or HAPUS) and confirm. */
export function AccountDeletion({ confirmTarget }: { confirmTarget: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [blocked, setBlocked] = useState<BlockedShop[]>([]);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim().toLowerCase() === confirmTarget.toLowerCase();

  const submit = () => {
    setError(undefined);
    setBlocked([]);
    startTransition(async () => {
      // On success the action signs out and redirects; only a refusal comes back.
      const result = await deleteMyAccount(typed);
      setError(result.error);
      setBlocked(result.blockedShops ?? []);
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h2 className="text-lg font-semibold">Hapus akun</h2>
      <p className="text-sm text-muted-foreground">
        Akunmu keluar dari semua toko di atas dan tidak bisa membukanya lagi. Toko demo milikmu ikut terhapus. Toko yang kamu miliki sendiri
        harus dihapus dulu atau diserahkan ke pemilik lain. Data penjualan toko tetap milik toko.
      </p>
      {!open ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Hapus akun saya…
        </Button>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-account">
              Ketik <span className="font-mono">{confirmTarget}</span> untuk konfirmasi
            </Label>
            <Input id="confirm-account" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" disabled={pending || !matches} onClick={submit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Hapus akun permanen
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {blocked.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {blocked.map((shop) => (
            <li key={shop.slug} className="flex flex-wrap gap-x-3">
              <span className="font-medium">{shop.name}:</span>
              <Link href={`${shopPath(shop.slug, "pengaturan")}#data-privasi`} className="text-primary underline-offset-4 hover:underline">
                hapus toko
              </Link>
              <Link href={shopPath(shop.slug, "pengaturan/anggota")} className="text-primary underline-offset-4 hover:underline">
                atur anggota tim
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
