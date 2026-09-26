"use client";

import type { OrderView } from "@wadar/contracts/sales";
import { cartSubtotal, cartTotal, suggestCashAmounts, type Cart, type CartAction } from "@wadar/core/cart";
import { formatRupiah } from "@wadar/core/money";
import { Button } from "@wadar/ui-web";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type Dispatch } from "react";
import { RupiahInput } from "../../../components/rupiah-input";
import { apiFetch } from "../../../lib/api-client";
import { errorMessage } from "../../../lib/errors";

type Method = "cash" | "transfer";

export function CheckoutSheet({
  cart,
  dispatch,
  outletId,
  onClose,
  onCompleted,
}: {
  cart: Cart;
  dispatch: Dispatch<CartAction>;
  outletId: string;
  onClose: () => void;
  onCompleted: (order: OrderView) => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState<number | undefined>();
  const [showDiscount, setShowDiscount] = useState(cart.discount > 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  // One key per checkout attempt, reused if the cashier retries after a
  // network error — the server then returns the same order instead of a
  // second one (CLAUDE.md aturan #6).
  const idempotencyKey = useRef(crypto.randomUUID());

  const total = cartTotal(cart);
  const change = tendered !== undefined ? tendered - total : undefined;
  const canPay = cart.items.length > 0 && (method === "transfer" || (change !== undefined && change >= 0));

  async function pay() {
    setSubmitting(true);
    setError(undefined);
    try {
      const order = await apiFetch<OrderView>("/v1/orders", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        body: {
          outletId,
          channel: "pos",
          lines: cart.items.map((i) => ({ variantId: i.variantId, qty: i.qty, discount: i.discount })),
          discount: cart.discount,
          payment: method === "cash" ? { method, tendered } : { method },
        },
      });
      idempotencyKey.current = crypto.randomUUID();
      router.refresh();
      onCompleted(order);
    } catch (err) {
      setError(errorMessage(err, "Transaksi gagal. Coba lagi — tidak akan tercatat dobel."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Pembayaran" className="fixed inset-0 z-50 flex flex-col bg-background md:items-center md:justify-center md:bg-black/40">
      <div className="flex h-full w-full flex-col bg-background md:h-auto md:max-h-[90dvh] md:max-w-lg md:rounded-2xl md:shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Pembayaran</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-full p-2 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ul className="flex flex-col gap-3">
            {cart.items.map((item) => (
              <li key={item.variantId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRupiah(item.unitPrice)}
                    {item.discount > 0 && ` · diskon ${formatRupiah(item.discount)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Kurangi ${item.name}`} onClick={() => dispatch({ type: "setQty", variantId: item.variantId, qty: item.qty - 1 })} className="flex h-10 w-10 items-center justify-center rounded-full border border-border">
                    {item.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </button>
                  <span className="w-8 text-center font-semibold">{item.qty}</span>
                  <button type="button" aria-label={`Tambah ${item.name}`} onClick={() => dispatch({ type: "setQty", variantId: item.variantId, qty: item.qty + 1 })} className="flex h-10 w-10 items-center justify-center rounded-full border border-border">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="w-24 text-right text-sm font-semibold">{formatRupiah(item.qty * item.unitPrice - item.discount)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-border pt-4">
            {showDiscount ? (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="order-discount" className="text-sm">Diskon</label>
                <div className="w-40">
                  <RupiahInput id="order-discount" value={cart.discount || undefined} onValueChange={(v) => dispatch({ type: "setOrderDiscount", discount: v ?? 0 })} />
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowDiscount(true)} className="text-sm font-medium text-primary underline">
                + Diskon
              </button>
            )}
            {cart.discount > 0 && (
              <p className="mt-2 flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatRupiah(cartSubtotal(cart))}</span>
              </p>
            )}
            <p className="mt-2 flex items-baseline justify-between">
              <span className="font-medium">Total</span>
              <span className="text-2xl font-bold">{formatRupiah(total)}</span>
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cara bayar">
            {(["cash", "transfer"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`h-12 rounded-lg border text-sm font-semibold ${method === m ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {m === "cash" ? "Tunai" : "Transfer"}
              </button>
            ))}
          </div>

          {method === "cash" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm font-medium">Uang diterima</p>
              <div className="grid grid-cols-2 gap-2">
                {suggestCashAmounts(total).map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setTendered(amount)}
                    className={`h-12 rounded-lg border text-sm font-semibold ${tendered === amount ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                  >
                    {amount === total ? "Uang pas" : formatRupiah(amount)}
                  </button>
                ))}
              </div>
              <RupiahInput aria-label="Jumlah uang lain" value={tendered} onValueChange={setTendered} placeholder="Jumlah lain" />
              {change !== undefined && (
                <p className={`flex items-baseline justify-between rounded-lg p-3 ${change < 0 ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>
                  <span className="text-sm font-medium">{change < 0 ? "Kurang" : "Kembalian"}</span>
                  <span className="text-xl font-bold">{formatRupiah(Math.abs(change))}</span>
                </p>
              )}
            </div>
          )}
          {method === "transfer" && (
            <p className="mt-4 rounded-lg bg-muted p-3 text-sm">Pastikan transfer sudah masuk ke rekening toko sebelum menyelesaikan.</p>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t border-border p-4">
          <Button size="lg" className="h-14 w-full text-base" disabled={!canPay || submitting} onClick={pay}>
            {submitting ? "Memproses..." : `Selesaikan ${formatRupiah(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
