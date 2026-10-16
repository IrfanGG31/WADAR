"use client";

import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cartTotals, cashSuggestions, changeDue } from "@/core/cart";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { PAYMENT_LABEL, type PaymentMethod } from "@/core/sale-schema";
import { cn } from "@/lib/utils";
import { recordSale } from "./actions";

export interface PosItem {
  variantId: string;
  name: string;
  option: string | null;
  category: string | null;
  unit: string;
  price: number;
  onHand: number;
}

export interface PosChannel {
  id: string;
  kind: string;
  name: string;
  feePct: number;
  feeFixed: number;
}

const MARKETPLACE_KINDS = new Set(["shopee", "tiktok_shop", "tokopedia", "gofood", "grabfood", "shopeefood"]);
const DIRECT_METHODS: PaymentMethod[] = ["tunai", "qris", "transfer"];

interface Done {
  total: number;
  change: number | null;
  duplicate: boolean;
  items: number;
}

/** Kasir (POS-1/2): tap products into the cart, pick channel and payment, Bayar. */
export function PosScreen({ slug, items, channels }: { slug: string; items: PosItem[]; channels: PosChannel[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [discount, setDiscount] = useState<number | undefined>();
  const [method, setMethod] = useState<PaymentMethod>("tunai");
  const [cash, setCash] = useState<number | undefined>();
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();
  const saleKey = useRef<string | null>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.variantId, i])), [items]);
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [items],
  );
  const channel = channels.find((c) => c.id === channelId) ?? channels[0];
  const viaMarketplace = channel ? MARKETPLACE_KINDS.has(channel.kind) : false;
  const payment: PaymentMethod = viaMarketplace ? "marketplace" : method;

  const lines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([variantId, qty]) => ({ variantId, qty, unitPrice: byId.get(variantId)?.price ?? 0 }));
  const totals = cartTotals(lines, discount ?? 0, channel ?? { feePct: 0, feeFixed: 0 });
  const change = payment === "tunai" ? changeDue(totals.total, cash) : null;
  const canPay = lines.length > 0 && !pending && (payment !== "tunai" || change !== null);

  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (!category || i.category === category) &&
      (!needle || `${i.name} ${i.option ?? ""}`.toLowerCase().includes(needle)),
  );

  function add(item: PosItem, delta: number) {
    setError(undefined);
    setCart((c) => {
      const next = Math.min(Math.max((c[item.variantId] ?? 0) + delta, 0), item.onHand);
      return { ...c, [item.variantId]: next };
    });
  }

  function reset() {
    setCart({});
    setDiscount(undefined);
    setCash(undefined);
    setPhone("");
    setCustomerName("");
    setCheckout(false);
    setDone(null);
    setError(undefined);
    saleKey.current = null;
  }

  function pay() {
    if (!canPay || !channel) return;
    setError(undefined);
    // One key per sale attempt: a double tap or a retry after a lost response can't record it twice.
    saleKey.current ??= crypto.randomUUID();
    const paidChange = change;
    startTransition(async () => {
      const result = await recordSale(slug, {
        channel_id: channel.id,
        items: lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })),
        order_discount: totals.orderDiscount,
        payment_method: payment,
        customer_phone: phone,
        customer_name: customerName,
        idempotency_key: saleKey.current,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone({ total: result.total ?? totals.total, change: paidChange, duplicate: !!result.duplicate, items: totals.items });
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border px-6 py-10 text-center">
        <CheckCircle2 className="h-14 w-14 text-success" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">{done.duplicate ? "Transaksi ini sudah tercatat" : "Transaksi tersimpan"}</p>
          <p className="text-3xl font-semibold tabular-nums">{formatRupiah(done.total)}</p>
          <p className="text-sm text-muted-foreground">{formatCount(done.items)} barang · {PAYMENT_LABEL[payment]}</p>
        </div>
        {done.change !== null && (
          <p className="rounded-lg bg-muted px-4 py-2 text-lg">
            Kembalian <span className="font-semibold tabular-nums">{formatRupiah(done.change)}</span>
          </p>
        )}
        <Button size="lg" className="w-full" onClick={reset} autoFocus>
          Transaksi baru
        </Button>
      </div>
    );
  }

  const cartPanel = (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Keranjang</h2>
        {lines.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCart({})}>
            Kosongkan
          </Button>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Ketuk produk untuk menambah ke keranjang.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((line) => {
            const item = byId.get(line.variantId);
            if (!item) return null;
            const itemFullName = item.option ? `${item.name} ${item.option}` : item.name;
            return (
              <li key={line.variantId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.name}
                    {item.option && <span className="text-muted-foreground"> · {item.option}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatRupiah(item.price)} × {formatCount(line.qty)} = {formatRupiah(item.price * line.qty)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" aria-label={`Kurangi ${itemFullName}`} onClick={() => add(item, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-7 text-center font-semibold tabular-nums">{formatCount(line.qty)}</span>
                  <Button type="button" variant="outline" size="icon" aria-label={`Tambah ${itemFullName}`} onClick={() => add(item, 1)} disabled={line.qty >= item.onHand}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-1.5" role="group" aria-labelledby="pos-channel-label">
        <span id="pos-channel-label" className="text-sm font-medium leading-none">Kanal penjualan</span>
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === channel?.id}
              onClick={() => setChannelId(c.id)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                c.id === channel?.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pos-discount">Diskon / voucher transaksi</Label>
        <RupiahInput id="pos-discount" value={discount} onValueChange={setDiscount} placeholder="0" />
      </div>

      {!viaMarketplace && (
        <div className="flex flex-col gap-1.5" role="group" aria-labelledby="pos-method-label">
          <span id="pos-method-label" className="text-sm font-medium leading-none">Metode bayar</span>
          <div className="grid grid-cols-3 gap-2">
            {DIRECT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  "h-11 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  method === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                )}
              >
                {PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
      )}

      {payment === "tunai" && lines.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="pos-cash">Uang diterima</Label>
          <RupiahInput id="pos-cash" value={cash} onValueChange={setCash} />
          <div className="flex flex-wrap gap-2">
            {cashSuggestions(totals.total).map((amount, i) => (
              <button
                key={amount}
                type="button"
                onClick={() => setCash(amount)}
                className="min-h-11 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {i === 0 ? "Uang pas" : formatRupiah(amount)}
              </button>
            ))}
          </div>
          {change !== null && (
            <p className="text-sm">
              Kembalian <span className="font-semibold tabular-nums">{formatRupiah(change)}</span>
            </p>
          )}
        </div>
      )}

      <details className="rounded-md border border-border px-3 py-1">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Pelanggan (opsional)
        </summary>
        <div className="mb-2 mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-phone">No. HP / WhatsApp</Label>
            <Input id="pos-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812-3456-7890" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-name">Nama</Label>
            <Input id="pos-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80} />
          </div>
        </div>
      </details>

      <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatRupiah(totals.subtotal)}</dd></div>
        {totals.orderDiscount > 0 && (
          <div className="flex justify-between"><dt>Diskon</dt><dd className="tabular-nums">−{formatRupiah(totals.orderDiscount)}</dd></div>
        )}
        <div className="flex justify-between text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatRupiah(totals.total)}</dd></div>
        {totals.platformFee > 0 && (
          <>
            <div className="flex justify-between text-muted-foreground"><dt>Perkiraan komisi {channel?.name}</dt><dd className="tabular-nums">−{formatRupiah(totals.platformFee)}</dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>Diterima toko</dt><dd className="tabular-nums">{formatRupiah(totals.net)}</dd></div>
          </>
        )}
      </dl>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <Button type="button" size="lg" onClick={pay} disabled={!canPay}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Menyimpan..." : `Bayar ${formatRupiah(totals.total)}`}
      </Button>
    </div>
  );

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-6">
      <section className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk" aria-label="Cari produk" className="pl-9" />
        </div>
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Kategori">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? "semua"}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  category === c ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                )}
              >
                {c ?? "Semua"}
              </button>
            ))}
          </div>
        )}
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
            Belum ada produk. Tambah produk dulu di menu Stok.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((item) => {
              const inCart = cart[item.variantId] ?? 0;
              const soldOut = item.onHand <= 0;
              return (
                <li key={item.variantId}>
                  <button
                    type="button"
                    onClick={() => add(item, 1)}
                    disabled={soldOut || inCart >= item.onHand}
                    className={cn(
                      "relative flex h-full min-h-24 w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
                      inCart > 0 ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="line-clamp-2 pr-6 text-sm font-medium leading-snug">
                      {item.name}
                      {item.option && <span className="text-muted-foreground"> · {item.option}</span>}
                    </span>
                    <span className="mt-auto font-semibold tabular-nums">{formatRupiah(item.price)}</span>
                    <span className={cn("text-xs", item.onHand <= 5 ? "text-amber-800" : "text-muted-foreground")}>
                      {soldOut ? "Habis" : `Stok ${formatCount(item.onHand)}`}
                    </span>
                    {inCart > 0 && (
                      <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {formatCount(inCart)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="h-16 md:hidden" aria-hidden />
      </section>

      {/* One cart panel: a full-screen sheet on mobile while paying, a sticky column on desktop. */}
      <aside
        role={checkout ? "dialog" : undefined}
        aria-modal={checkout ? true : undefined}
        aria-label="Pembayaran"
        className={cn(
          "md:sticky md:top-20 md:block md:rounded-xl md:border md:border-border md:p-4",
          checkout ? "fixed inset-0 z-50 overflow-y-auto bg-background px-4 pb-8 pt-4 md:static md:z-auto md:overflow-visible" : "hidden",
        )}
      >
        {checkout && (
          <Button type="button" variant="ghost" size="sm" className="mb-2 -ml-2 md:hidden" onClick={() => setCheckout(false)}>
            <ArrowLeft className="h-4 w-4" />
            Pilih produk
          </Button>
        )}
        {cartPanel}
      </aside>

      {lines.length > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-[4.25rem] z-30 px-4 pb-[env(safe-area-inset-bottom)] md:hidden">
          <button
            type="button"
            onClick={() => setCheckout(true)}
            className="flex h-14 w-full items-center gap-3 rounded-xl bg-primary px-4 text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ShoppingCart className="h-5 w-5" aria-hidden />
            <span className="flex-1 text-left font-medium">{formatCount(totals.items)} barang</span>
            <span className="font-semibold tabular-nums">{formatRupiah(totals.total)}</span>
            <span className="rounded-md bg-white/20 px-2 py-1 text-sm font-semibold">Bayar</span>
          </button>
        </div>
      )}
    </div>
  );
}
