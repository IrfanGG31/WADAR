"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StorePersona, StorePolicies } from "@/core/chat/store-policies";
import { saveStoreProfile } from "./actions";

interface EstimateRow {
  area: string;
  cost_min: string;
  cost_max: string;
  eta: string;
  keywords: string;
}

const toRow = (e: StorePolicies["shipping_estimates"][number]): EstimateRow => ({
  area: e.area,
  cost_min: String(e.cost_min),
  cost_max: String(e.cost_max),
  eta: e.eta,
  keywords: e.keywords.join(", "),
});

const toNumber = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(/\D/g, "")));
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Kebijakan toko + persona: the structured data the chat answers from (never embedded, always in the prompt). */
export function StoreProfileForm({ slug, policies, persona }: { slug: string; policies: StorePolicies; persona: StorePersona }) {
  const [p, setP] = useState({
    hours: policies.hours,
    address: policies.address,
    shipping_areas: policies.shipping_areas,
    returns: policies.returns,
    warranty: policies.warranty,
    processing_time: policies.processing_time,
    order_steps: policies.order_steps,
    admin_contact: policies.admin_contact,
    promo: policies.promo,
    payment_methods: policies.payment_methods.join(", "),
    cod: policies.cod.available === null ? "" : policies.cod.available ? "ya" : "tidak",
    cod_note: policies.cod.note,
  });
  const [estimates, setEstimates] = useState<EstimateRow[]>(policies.shipping_estimates.map(toRow));
  const [per, setPer] = useState({ ...persona });
  const [result, setResult] = useState<{ error?: string; saved?: boolean }>();
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof p) => (e: { target: { value: string } }) => setP((prev) => ({ ...prev, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveStoreProfile(slug, {
        policies: {
          hours: p.hours,
          address: p.address,
          shipping_areas: p.shipping_areas,
          shipping_estimates: estimates
            .filter((x) => x.area.trim())
            .map((x) => ({ area: x.area, cost_min: toNumber(x.cost_min), cost_max: toNumber(x.cost_max), eta: x.eta, keywords: splitList(x.keywords) })),
          cod: { available: p.cod === "" ? null : p.cod === "ya", note: p.cod_note },
          payment_methods: splitList(p.payment_methods),
          returns: p.returns,
          warranty: p.warranty,
          processing_time: p.processing_time,
          order_steps: p.order_steps,
          admin_contact: p.admin_contact,
          promo: p.promo,
        },
        persona: per,
      });
      setResult(r.error ? { error: r.error } : { saved: true });
    });
  }

  const field = (id: keyof typeof p, label: string, hint?: string, multiline = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          id={id}
          value={p[id]}
          onChange={set(id)}
          rows={2}
          className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
        />
      ) : (
        <Input id={id} value={p[id]} onChange={set(id)} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Kebijakan toko</h2>
        {field("hours", "Jam buka", "Contoh: Senin–Sabtu 09.00–20.00 WIB")}
        {field("address", "Alamat toko")}
        {field("shipping_areas", "Area & cara kirim", "Contoh: Kirim ke seluruh Indonesia lewat JNE dan J&T.", true)}
        {field("processing_time", "Waktu proses pesanan")}
        {field("order_steps", "Cara pesan", undefined, true)}
        {field("payment_methods", "Metode bayar", "Pisahkan dengan koma: Transfer BCA, QRIS, COD")}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cod">COD</Label>
            <select
              id="cod"
              value={p.cod}
              onChange={set("cod")}
              className="h-11 rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
            >
              <option value="">Belum diisi</option>
              <option value="ya">Bisa COD</option>
              <option value="tidak">Tidak COD</option>
            </select>
          </div>
          {field("cod_note", "Catatan COD")}
        </div>
        {field("returns", "Retur / tukar", undefined, true)}
        {field("warranty", "Garansi")}
        {field("promo", "Promo berjalan", "Kata diskon, gratis ongkir, cashback hanya dipakai asisten kalau tertulis di sini atau di FAQ.")}
        {field("admin_contact", "Nomor admin", "Satu-satunya nomor HP yang boleh disebut asisten selain nomor pembeli.")}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Estimasi ongkir</h2>
        {estimates.length === 0 && <p className="text-sm text-muted-foreground">Belum ada. Tanpa ini asisten tidak menyebut angka ongkir.</p>}
        {estimates.map((row, i) => {
          const upd = (k: keyof EstimateRow) => (e: { target: { value: string } }) =>
            setEstimates((prev) => prev.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
          const updNum = (k: "cost_min" | "cost_max") => (n: number | undefined) =>
            setEstimates((prev) => prev.map((r, j) => (j === i ? { ...r, [k]: n === undefined ? "" : String(n) } : r)));
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <Input aria-label={`Area ongkir ${i + 1}`} placeholder="Area (mis. Pulau Jawa)" value={row.area} onChange={upd("area")} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus baris ongkir ${row.area || i + 1}`}
                  onClick={() => setEstimates((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`cost-min-${i}`} className="text-xs text-muted-foreground">
                    Ongkir terendah
                  </Label>
                  <RupiahInput
                    id={`cost-min-${i}`}
                    value={row.cost_min.trim() === "" ? undefined : toNumber(row.cost_min)}
                    onValueChange={updNum("cost_min")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`cost-max-${i}`} className="text-xs text-muted-foreground">
                    Ongkir tertinggi
                  </Label>
                  <RupiahInput
                    id={`cost-max-${i}`}
                    value={row.cost_max.trim() === "" ? undefined : toNumber(row.cost_max)}
                    onValueChange={updNum("cost_max")}
                  />
                </div>
              </div>
              <Input aria-label={`Estimasi tiba area ${i + 1}`} placeholder="Estimasi tiba (mis. 2–4 hari)" value={row.eta} onChange={upd("eta")} />
              <Input
                aria-label={`Kata kunci kota area ${i + 1}`}
                placeholder="Kata kunci kota, pisah koma (jakarta, bandung)"
                value={row.keywords}
                onChange={upd("keywords")}
              />
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          onClick={() => setEstimates((prev) => [...prev, { area: "", cost_min: "", cost_max: "", eta: "", keywords: "" }])}
        >
          <Plus aria-hidden /> Tambah area
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Asisten</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="persona-name">Nama asisten</Label>
            <Input id="persona-name" value={per.name} onChange={(e) => setPer({ ...per, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="persona-salutation">Sapaan pembeli</Label>
            <Input id="persona-salutation" value={per.salutation} onChange={(e) => setPer({ ...per, salutation: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="persona-style">Gaya bahasa</Label>
          <select
            id="persona-style"
            value={per.style}
            onChange={(e) => setPer({ ...per, style: e.target.value as StorePersona["style"] })}
            className="h-11 rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          >
            <option value="santai">Santai</option>
            <option value="formal">Formal</option>
          </select>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={per.emoji}
            onChange={(e) => setPer({ ...per, emoji: e.target.checked })}
            className="size-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />{" "}
          Boleh pakai emoji
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="persona-holding">Pesan saat diteruskan ke admin</Label>
          <textarea
            id="persona-holding"
            value={per.holding_message}
            onChange={(e) => setPer({ ...per, holding_message: e.target.value })}
            rows={2}
            maxLength={300}
            placeholder="Kosongkan untuk memakai pesan bawaan."
            className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          />
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-col gap-2 bg-background py-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Simpan pengaturan
        </Button>
        {result?.error && (
          <p role="alert" className="text-sm text-red-800">
            {result.error}
          </p>
        )}
        {result?.saved && (
          <p role="status" className="text-sm text-emerald-700">
            Tersimpan.
          </p>
        )}
      </div>
    </form>
  );
}
