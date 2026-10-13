import { Package, Receipt, ShoppingBag, UserPlus } from "lucide-react";

export const metadata = { title: "Beranda" };

const CARDS = [
  { label: "Total Penjualan Hari Ini", icon: ShoppingBag },
  { label: "Jumlah Transaksi", icon: Receipt },
  { label: "Produk Terjual", icon: Package },
  { label: "Pelanggan Baru", icon: UserPlus },
] as const;

/** D1 placeholder: the Beranda layout from PRD §7.2, filled with real numbers from D4. */
export default function BerandaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Selamat datang</p>
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map(({ label, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">—</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
        Belum ada penjualan. Tren 7 hari, stok menipis, dan insight untukmu muncul di sini setelah transaksi pertama.
      </div>
    </div>
  );
}
