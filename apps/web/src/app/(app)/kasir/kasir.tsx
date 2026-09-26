"use client";

import type { StockItemView } from "@wadar/contracts/inventory";
import type { OrderView } from "@wadar/contracts/sales";
import { cartItemCount, cartReducer, cartTotal, emptyCart } from "@wadar/core/cart";
import { formatRupiah } from "@wadar/core/money";
import { Input } from "@wadar/ui-web";
import { Package, ScanBarcode, Search, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { BarcodeScanner, barcodeScanSupported } from "./barcode-scanner";
import { CheckoutSheet } from "./checkout-sheet";
import { SaleComplete } from "./sale-complete";

export function Kasir({
  products,
  outletId,
  outletName,
  storeName,
  canManageProducts,
}: {
  products: StockItemView[];
  outletId: string;
  outletName: string;
  storeName: string;
  canManageProducts: boolean;
}) {
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [completed, setCompleted] = useState<OrderView>();
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        p.variantName.toLowerCase().includes(q) ||
        p.sku?.toLowerCase() === q ||
        p.barcode === q,
    );
  }, [products, query]);

  const qtyInCart = useMemo(() => new Map(cart.items.map((i) => [i.variantId, i.qty])), [cart]);

  function add(product: StockItemView) {
    dispatch({
      type: "add",
      item: {
        variantId: product.variantId,
        name: product.variantName ? `${product.productName} (${product.variantName})` : product.productName,
        unitPrice: product.price,
      },
    });
    setNotice(`${product.productName} +1`);
  }

  function addByCode(code: string): boolean {
    const match = products.find((p) => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase());
    if (match) add(match);
    else setNotice(`Kode "${code}" tidak ditemukan`);
    return match !== undefined;
  }

  /** Keyboard-wedge barcode scanners type the code and press Enter. */
  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const code = query.trim();
    if (!code) return;
    if (addByCode(code)) setQuery("");
    else if (filtered.length === 1) {
      add(filtered[0]!);
      setQuery("");
    }
  }

  if (completed) {
    return (
      <SaleComplete
        order={completed}
        storeName={storeName}
        onNewSale={() => {
          setCompleted(undefined);
          dispatch({ type: "clear" });
          searchRef.current?.focus();
        }}
      />
    );
  }

  const count = cartItemCount(cart);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 pb-28 md:p-6 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Kasir</h1>
        <span className="text-sm text-muted-foreground">{outletName}</span>
      </div>

      <form onSubmit={onSearchSubmit} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari atau scan barcode"
            aria-label="Cari produk atau scan barcode"
            className="h-12 pl-9"
            autoComplete="off"
          />
        </div>
        {barcodeScanSupported() && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label="Scan barcode pakai kamera"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>
        )}
      </form>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {notice}
      </p>

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-10 text-center">
          <Package className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Belum ada produk untuk dijual.</p>
          {canManageProducts && (
            <Link href="/stok/baru" className="font-medium text-primary underline">
              Tambah produk dulu
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => {
            const inCart = qtyInCart.get(product.variantId);
            return (
              <li key={product.variantId}>
                <button
                  type="button"
                  onClick={() => add(product)}
                  className={`relative flex min-h-24 w-full flex-col justify-between rounded-xl border p-3 text-left transition-colors active:scale-[0.98] ${
                    inCart ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className="line-clamp-2 text-sm font-medium leading-snug">
                    {product.productName}
                    {product.variantName && <span className="text-muted-foreground"> · {product.variantName}</span>}
                  </span>
                  <span className="mt-2 flex items-end justify-between gap-1">
                    <span className="font-semibold">{formatRupiah(product.price)}</span>
                    <span className={`text-xs ${product.onHand <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      stok {product.onHand}
                    </span>
                  </span>
                  {inCart && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                      {inCart}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-3 md:bottom-4 md:left-64 md:px-6">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between rounded-xl bg-primary px-4 text-primary-foreground shadow-lg"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShoppingCart className="h-5 w-5" /> {count} barang
            </span>
            <span className="text-base font-bold">Bayar {formatRupiah(cartTotal(cart))}</span>
          </button>
        </div>
      )}

      {sheetOpen && (
        <CheckoutSheet
          cart={cart}
          dispatch={dispatch}
          outletId={outletId}
          onClose={() => setSheetOpen(false)}
          onCompleted={(order) => {
            setSheetOpen(false);
            setCompleted(order);
          }}
        />
      )}
      {scanning && (
        <BarcodeScanner
          onDetected={(code) => {
            addByCode(code);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}
