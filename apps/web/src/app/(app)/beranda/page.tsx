import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  FakeChart
} from "@wadar/ui-web";
import { 
  ShoppingCart, 
  Users, 
  Sparkles, 
  TrendingUp,
  Wallet,
  ReceiptText,
  ShoppingBag,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Package,
  LineChart,
  MessageSquare,
  Headset
} from "lucide-react";
import Link from "next/link";

export default function BerandaPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Top Banner Area */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/10 p-6 md:p-8">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Selamat Datang di WADAR!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-lg leading-relaxed">
            Solusi cerdas untuk mengelola bisnis Anda.<br/>
            Dari pencatatan hingga pengambilan keputusan, semua dalam satu platform.
          </p>
          
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">POS</h3>
              <p className="text-[10px] text-muted-foreground leading-tight">Transaksi lebih mudah dan cepat</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">CRM</h3>
              <p className="text-[10px] text-muted-foreground leading-tight">Kelola pelanggan dengan lebih baik</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
              <p className="text-[10px] text-muted-foreground leading-tight">Dapatkan rekomendasi berbasis data</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Pertumbuhan</h3>
              <p className="text-[10px] text-muted-foreground leading-tight">Bisnis lebih efisien dan berkelanjutan</p>
            </div>
          </div>
        </div>
        {/* Decorative illustration placeholder for the right side */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-primary/10 to-transparent hidden lg:block opacity-50"></div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Total Penjualan (Hari Ini)</p>
                <h3 className="text-2xl font-bold mt-1">Rp 4.250.000</h3>
                <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-600">
                  <ArrowUp className="h-3 w-3" />
                  <span>12% dari kemarin</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ReceiptText className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Jumlah Transaksi</p>
                <h3 className="text-2xl font-bold mt-1">42</h3>
                <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-600">
                  <ArrowUp className="h-3 w-3" />
                  <span>8% dari kemarin</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Produk Terjual</p>
                <h3 className="text-2xl font-bold mt-1">128</h3>
                <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-600">
                  <ArrowUp className="h-3 w-3" />
                  <span>15% dari kemarin</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Pelanggan Baru</p>
                <h3 className="text-2xl font-bold mt-1">12</h3>
                <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-600">
                  <ArrowUp className="h-3 w-3" />
                  <span>33% dari kemarin</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold">Tren Penjualan 7 Hari Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
             <FakeChart />
          </CardContent>
        </Card>
        <Card className="shadow-sm flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-sm font-semibold">Stok Menipis</CardTitle>
            <Link href="/stok" className="text-[10px] font-semibold text-primary hover:underline">Lihat Semua</Link>
          </CardHeader>
          <CardContent className="flex-1 p-0">
             <div className="flex flex-col">
               {[
                 { name: "Tissue Basah", qty: 5, color: "bg-blue-100", img: "🧼" },
                 { name: "Sabun Cair", qty: 8, color: "bg-orange-100", img: "🧴" },
                 { name: "Mie Instan", qty: 12, color: "bg-red-100", img: "🍜" },
               ].map((item, i) => (
                 <div key={i} className="flex items-center gap-3 px-6 py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors cursor-pointer">
                   <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.color} text-lg`}>
                     {item.img}
                   </div>
                   <div className="flex-1 overflow-hidden">
                     <p className="truncate text-sm font-medium">{item.name}</p>
                     <p className="text-xs font-semibold text-destructive">Sisa {item.qty} pcs</p>
                   </div>
                   <ChevronRight className="h-4 w-4 text-muted-foreground" />
                 </div>
               ))}
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row - Insight */}
      <div>
        <h2 className="text-sm font-semibold mb-4">Insight untukmu</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-sm bg-blue-50/50 border-blue-100">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-blue-700">
                <Package className="h-5 w-5" />
                <h4 className="text-xs font-bold">Prediksi Stok</h4>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
                Stok Minuman Kemasan diprediksi akan habis dalam 3 hari. Disarankan untuk melakukan pemesanan ulang.
              </p>
              <Link href="/stok" className="text-[10px] font-semibold text-blue-700 mt-1 hover:underline">Lihat Rekomendasi</Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm bg-indigo-50/50 border-indigo-100">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-indigo-700">
                <LineChart className="h-5 w-5" />
                <h4 className="text-xs font-bold">Analisis Keuangan</h4>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
                Produk Snack memberikan margin tertinggi (45%). Pertimbangkan untuk menambah stok produk ini.
              </p>
              <Link href="/keuangan" className="text-[10px] font-semibold text-indigo-700 mt-1 hover:underline">Lihat Detail</Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm bg-violet-50/50 border-violet-100">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-violet-700">
                <MessageSquare className="h-5 w-5" />
                <h4 className="text-xs font-bold">Chat Pelanggan</h4>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
                Ada 5 pertanyaan serupa tentang stok dan harga. Gunakan AI Chat untuk menjawab otomatis.
              </p>
              <Link href="/asisten" className="text-[10px] font-semibold text-violet-700 mt-1 hover:underline">Buka Chat AI</Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm bg-emerald-50/50 border-emerald-100">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <Headset className="h-5 w-5" />
                <h4 className="text-xs font-bold">Konsultasi Bisnis</h4>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
                Tanyakan strategi bisnis, analisis pasar, atau rekomendasi produk langsung ke AI.
              </p>
              <Link href="/konsultasi" className="text-[10px] font-semibold text-emerald-700 mt-1 hover:underline">Mulai Konsultasi</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
