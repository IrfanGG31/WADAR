"use client";

import type { OrderView } from "@wadar/contracts/sales";
import { formatRupiah } from "@wadar/core/money";
import { Button } from "@wadar/ui-web";
import { CheckCircle2, MessageCircle, Printer } from "lucide-react";

export function SaleComplete({ order, storeName, onNewSale }: { order: OrderView; storeName: string; onNewSale: () => void }) {
  const receiptUrl = `${window.location.origin}/struk/${order.receiptToken}`;
  const waText = `Terima kasih sudah belanja di ${storeName}! Total ${formatRupiah(order.net)}. Struk: ${receiptUrl}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 p-6 text-center">
      <CheckCircle2 className="h-16 w-16 text-emerald-600" />
      <div>
        <p className="text-sm text-muted-foreground">Transaksi #{order.orderNumber} berhasil</p>
        <p className="mt-1 text-3xl font-bold">{formatRupiah(order.net)}</p>
      </div>
      {order.change > 0 && (
        <div className="w-full rounded-xl bg-emerald-50 p-4 text-emerald-900">
          <p className="text-sm font-medium">Kembalian</p>
          <p className="text-3xl font-bold">{formatRupiah(order.change)}</p>
        </div>
      )}
      <div className="grid w-full grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border font-medium hover:bg-muted"
        >
          <MessageCircle className="h-4 w-4" /> Kirim ke WA
        </a>
        <a
          href={`/struk/${order.receiptToken}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border font-medium hover:bg-muted"
        >
          <Printer className="h-4 w-4" /> Lihat struk
        </a>
      </div>
      <Button size="lg" className="h-14 w-full text-base" onClick={onNewSale} autoFocus>
        Transaksi baru
      </Button>
    </div>
  );
}
