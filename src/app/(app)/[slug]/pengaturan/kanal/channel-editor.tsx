"use client";

import { Loader2, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHANNEL_KIND_LABEL, CHANNEL_KINDS, canDeactivate, DEFAULT_CHANNEL_FEE, estimateFee, type ChannelKind } from "@/core/channel-settings";
import { formatRupiah } from "@/core/money";
import { cn } from "@/lib/utils";
import { addChannel, updateChannel } from "./actions";

export interface ChannelView {
  id: string;
  kind: string;
  name: string;
  fee_pct: number;
  fee_fixed: number;
  is_active: boolean;
  fee_is_default: boolean;
}

const EXAMPLE_ORDER = 100_000;

/** "12,5" or "12.5" → 12.5; empty → undefined. */
function parsePct(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function pctText(n: number): string {
  return String(n).replace(".", ",");
}

export function ChannelEditor({ channels }: { channels: ChannelView[] }) {
  return (
    <div className="flex flex-col gap-4">
      {channels.map((c) => (
        <ChannelCard key={c.id} channel={c} />
      ))}
      <NewChannel />
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelView }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [pct, setPct] = useState(pctText(channel.fee_pct));
  const [fixed, setFixed] = useState<number | undefined>(channel.fee_fixed);
  const [active, setActive] = useState(channel.is_active);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const pctValue = parsePct(pct);
  const valid = pctValue !== undefined && !Number.isNaN(pctValue) && fixed !== undefined;
  const dirty = pctValue !== channel.fee_pct || fixed !== channel.fee_fixed || active !== channel.is_active;
  const label = CHANNEL_KIND_LABEL[channel.kind as ChannelKind] ?? channel.kind;

  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm", !active && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{channel.name}</h2>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        {channel.fee_is_default && channel.fee_pct + channel.fee_fixed > 0 && (
          <Badge variant="warning" title="Nilai awal WADAR. Cek tarif sebenarnya di akun seller-mu.">
            Perkiraan
          </Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`pct-${channel.id}`}>Komisi (%)</Label>
          <Input id={`pct-${channel.id}`} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`fixed-${channel.id}`}>Biaya tetap per pesanan</Label>
          <RupiahInput id={`fixed-${channel.id}`} value={fixed} onValueChange={setFixed} />
        </div>
      </div>
      {valid && (pctValue ?? 0) + (fixed ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          Contoh: pesanan {formatRupiah(EXAMPLE_ORDER)} → komisi{" "}
          <span className="font-medium text-foreground">{formatRupiah(estimateFee(EXAMPLE_ORDER, pctValue ?? 0, fixed ?? 0))}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canDeactivate(channel.kind) ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Kanal aktif (muncul di Kasir)
          </label>
        ) : (
          <span className="text-sm text-muted-foreground">Kanal kasir selalu aktif</span>
        )}
        <Button
          type="button"
          disabled={!dirty || !valid || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateChannel(slug, channel.id, { fee_pct: pctValue, fee_fixed: fixed, is_active: active });
              setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: "Tersimpan." });
              if (!result.error) router.refresh();
            })
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </div>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </section>
  );
}

function NewChannel() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChannelKind>("tokopedia");
  const [name, setName] = useState<string>(CHANNEL_KIND_LABEL.tokopedia);
  const [pct, setPct] = useState(pctText(DEFAULT_CHANNEL_FEE.tokopedia?.fee_pct ?? 0));
  const [fixed, setFixed] = useState<number | undefined>(DEFAULT_CHANNEL_FEE.tokopedia?.fee_fixed ?? 0);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Tambah kanal
      </Button>
    );
  }

  function pick(next: ChannelKind) {
    setKind(next);
    setName(CHANNEL_KIND_LABEL[next]);
    const d = DEFAULT_CHANNEL_FEE[next];
    setPct(pctText(d?.fee_pct ?? 0));
    setFixed(d?.fee_fixed ?? 0);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/50 p-4">
      <h2 className="font-semibold">Kanal baru</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-kind">Jenis</Label>
          <select
            id="new-kind"
            value={kind}
            onChange={(e) => pick(e.target.value as ChannelKind)}
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            {CHANNEL_KINDS.filter((k) => k !== "pos").map((k) => (
              <option key={k} value={k}>
                {CHANNEL_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-name">Nama</Label>
          <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-pct">Komisi (%)</Label>
          <Input id="new-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-fixed">Biaya tetap per pesanan</Label>
          <RupiahInput id="new-fixed" value={fixed} onValueChange={setFixed} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await addChannel(slug, { kind, name, fee_pct: parsePct(pct), fee_fixed: fixed });
              if (result.error) return setError(result.error);
              setOpen(false);
              router.refresh();
            })
          }
        >
          Simpan kanal
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
