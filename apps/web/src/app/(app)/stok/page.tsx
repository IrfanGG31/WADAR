import { Card, CardContent, Button, Badge } from "@wadar/ui-web";
import { Search, Filter, AlertTriangle, Info, Plus } from "lucide-react";
import Image from "next/image";

export default function StokPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stok</h1>
          <p className="text-sm text-muted-foreground mt-1">128 Produk <span className="text-destructive font-medium">• 7 perlu perhatian</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Tambah Produk
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <Badge variant="default" className="cursor-pointer whitespace-nowrap px-4 py-1.5 text-sm">Semua</Badge>
        <Badge variant="outline" className="cursor-pointer whitespace-nowrap px-4 py-1.5 text-sm text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/10">Hampir Habis (7)</Badge>
        <Badge variant="outline" className="cursor-pointer whitespace-nowrap px-4 py-1.5 text-sm text-amber-600 border-amber-600/30 bg-amber-600/5 hover:bg-amber-600/10">Overstock (3)</Badge>
        <Badge variant="outline" className="cursor-pointer whitespace-nowrap px-4 py-1.5 text-sm text-blue-600 border-blue-600/30 bg-blue-600/5 hover:bg-blue-600/10">Lambat Laku (12)</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Critical Alert Card */}
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="p-5 flex items-start gap-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
              <div className="h-16 w-16 shrink-0 rounded-lg bg-destructive/10 flex items-center justify-center text-3xl">
                🧴
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Serum Niacinamide 30ml</h3>
                <p className="text-xs text-muted-foreground mt-0.5">SKU: SR-NC-30</p>
                <div className="flex gap-4 mt-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Stok</p>
                    <p className="font-bold text-destructive">8 unit</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Terjual</p>
                    <p className="font-bold">17/hari</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-xs font-medium leading-tight">
                  Diperkirakan habis dalam 2 hari! Stok sangat kritis karena laju penjualan sedang tinggi.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 p-2 rounded-md">
                <Info className="h-4 w-4 shrink-0" />
                <span>Rekomendasi WADAR: Pesan 50 unit</span>
              </div>
              <div className="flex gap-2 mt-1">
                <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" size="sm">Pesan Ulang</Button>
                <Button variant="outline" size="sm" className="px-3">Detail</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Warning Alert Card */}
        <Card className="border-amber-600/30 bg-amber-600/5 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="p-5 flex items-start gap-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
              <div className="h-16 w-16 shrink-0 rounded-lg bg-amber-600/10 flex items-center justify-center text-3xl">
                📦
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Kardus Packing Sedang</h3>
                <p className="text-xs text-muted-foreground mt-0.5">SKU: PKG-M</p>
                <div className="flex gap-4 mt-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Stok</p>
                    <p className="font-bold text-amber-600">45 unit</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Terjual</p>
                    <p className="font-bold">20/hari</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-xs font-medium leading-tight">
                  Stok menipis, diprediksi habis 3 hari lagi.
                </p>
              </div>
              <div className="flex gap-2 mt-auto pt-7">
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white border-0" size="sm">Pesan Ulang</Button>
                <Button variant="outline" size="sm" className="px-3">Detail</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Normal Product Card */}
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="p-5 flex items-start gap-4 border-b border-border/50">
              <div className="h-16 w-16 shrink-0 rounded-lg bg-muted flex items-center justify-center text-3xl">
                🧴
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Sabun Cuci Muka</h3>
                <p className="text-xs text-muted-foreground mt-0.5">SKU: FW-100</p>
                <div className="flex gap-4 mt-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Stok</p>
                    <p className="font-bold">120 unit</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Terjual</p>
                    <p className="font-bold">5/hari</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2 text-emerald-600">
                <div className="h-4 w-4 mt-0.5 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-600"></div>
                </div>
                <p className="text-xs font-medium leading-tight">
                  Stok aman untuk 24 hari ke depan.
                </p>
              </div>
              <div className="flex gap-2 mt-auto pt-7">
                <Button variant="outline" className="flex-1" size="sm">Pesan Ulang</Button>
                <Button variant="outline" size="sm" className="px-3">Detail</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
