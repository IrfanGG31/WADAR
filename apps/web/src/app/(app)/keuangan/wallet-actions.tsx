"use client";

import type { WalletType, WalletView } from "@wadar/contracts/finance";
import { WALLET_TYPE_LABEL } from "@wadar/contracts/finance";
import { Button, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RupiahInput } from "../../../components/rupiah-input";
import { apiFetch } from "../../../lib/api-client";
import { errorMessage } from "../../../lib/errors";

type Panel = "add" | "transfer" | "adjust" | null;
const selectClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-base md:text-sm";

export function WalletActions({ wallets }: { wallets: WalletView[] }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [type, setType] = useState<WalletType>("ewallet");
  const [amount, setAmount] = useState<number | undefined>();
  const [from, setFrom] = useState(wallets[0]?.id ?? "");
  const [to, setTo] = useState(wallets[1]?.id ?? "");
  const [target, setTarget] = useState(wallets[0]?.id ?? "");
  const [note, setNote] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setPanel(null);
      setAmount(undefined);
      setName("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Gagal menyimpan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setPanel(panel === "add" ? null : "add")}>Tambah dompet</Button>
        <Button variant="outline" size="sm" onClick={() => setPanel(panel === "transfer" ? null : "transfer")} disabled={wallets.length < 2}>Pindah dana</Button>
        <Button variant="outline" size="sm" onClick={() => setPanel(panel === "adjust" ? null : "adjust")}>Sesuaikan saldo</Button>
      </div>

      {panel === "add" && (
        <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="w-name">Nama</Label><Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="GoPay, BCA, Saldo Shopee" /></div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-type">Jenis</Label>
            <select id="w-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as WalletType)}>
              {(Object.keys(WALLET_TYPE_LABEL) as WalletType[]).map((t) => <option key={t} value={t}>{WALLET_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="w-open">Saldo sekarang</Label><RupiahInput id="w-open" value={amount} onValueChange={setAmount} placeholder="0" /></div>
          <Button size="sm" className="self-start" disabled={busy || name.trim().length < 2}
            onClick={() => run(() => apiFetch("/v1/finance/wallets", { method: "POST", idempotencyKey: crypto.randomUUID(), body: { name, type, openingBalance: amount ?? 0 } }))}>
            Simpan
          </Button>
        </div>
      )}

      {panel === "transfer" && (
        <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-from">Dari</Label>
            <select id="t-from" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)}>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-to">Ke</Label>
            <select id="t-to" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="t-amt">Jumlah</Label><RupiahInput id="t-amt" value={amount} onValueChange={setAmount} /></div>
          <Button size="sm" className="self-start" disabled={busy || !amount || from === to}
            onClick={() => run(() => apiFetch("/v1/finance/transfers", { method: "POST", idempotencyKey: crypto.randomUUID(), body: { fromWalletId: from, toWalletId: to, amount } }))}>
            Pindahkan
          </Button>
        </div>
      )}

      {panel === "adjust" && (
        <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-wallet">Dompet</Label>
            <select id="a-wallet" className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)}>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="a-amt">Saldo sebenarnya</Label><RupiahInput id="a-amt" value={amount} onValueChange={setAmount} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="a-note">Catatan</Label><Input id="a-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. hitung laci sore" /></div>
          <Button size="sm" className="self-start" disabled={busy || amount === undefined}
            onClick={() => run(() => apiFetch(`/v1/finance/wallets/${target}/balance`, { method: "POST", idempotencyKey: crypto.randomUUID(), body: { actualBalance: amount, note: note || undefined } }))}>
            Simpan selisih
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
