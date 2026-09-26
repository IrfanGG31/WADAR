import { Card, CardContent, Button, FakeChart } from "@wadar/ui-web";
import { Sparkles, TrendingDown, Info, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function KeuanganPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Berapa sebenarnya keuntungan tokomu?</h1>
        <p className="text-sm text-muted-foreground mt-1">Laporan keuangan & insight otomatis dari WADAR AI.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Receipt-style Hero Metric Card */}
        <Card className="shadow-md border-border bg-white overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-400 to-primary"></div>
          <CardContent className="p-8 font-mono text-sm">
            <h3 className="text-center font-sans font-bold text-lg mb-6 tracking-tight text-foreground">RINGKASAN BULAN INI</h3>
            
            <div className="flex justify-between items-center mb-3">
              <span className="text-muted-foreground">Omzet</span>
              <span className="font-medium text-base">Rp 38.200.000</span>
            </div>
            
            <div className="flex justify-between items-center mb-3 text-destructive">
              <span>HPP</span>
              <span>- Rp 22.400.000</span>
            </div>
            
            <div className="flex justify-between items-center mb-4 text-destructive">
              <span>Biaya Operasional</span>
              <span>- Rp 8.100.000</span>
            </div>
            
            <div className="border-t-2 border-dashed border-border my-4"></div>
            
            <div className="flex justify-between items-center text-lg font-bold text-primary mt-2">
              <span className="font-sans">Laba Bersih</span>
              <span>Rp 7.700.000</span>
            </div>
          </CardContent>
        </Card>

        {/* WADAR Insight Signature Feature */}
        <Card className="border-indigo-200 bg-indigo-50 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-10 -top-10 text-indigo-100 opacity-50">
            <Sparkles className="h-40 w-40" />
          </div>
          <CardContent className="p-6 relative z-10 flex-1 flex flex-col">
            <div className="flex items-center gap-2 text-indigo-700 mb-4">
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <h3 className="font-bold">WADAR Insight</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <TrendingDown className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <h4 className="font-semibold text-lg leading-tight text-foreground">Laba turun Rp1,2 juta dibanding bulan lalu.</h4>
              </div>
              
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-indigo-100 space-y-2">
                <p className="text-sm font-medium text-foreground">Penyebab Utama:</p>
                <ul className="space-y-1.5">
                  <li className="flex justify-between text-xs text-muted-foreground">
                    <span>Kenaikan HPP Supplier</span>
                    <span className="font-semibold text-destructive">62% pengaruh</span>
                  </li>
                  <li className="flex justify-between text-xs text-muted-foreground">
                    <span>Diskon & Promo</span>
                    <span className="font-semibold text-amber-600">24% pengaruh</span>
                  </li>
                  <li className="flex justify-between text-xs text-muted-foreground">
                    <span>Biaya Layanan App</span>
                    <span className="font-semibold text-amber-600">14% pengaruh</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Link href="/asisten" className="flex-1">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  <Sparkles className="h-4 w-4" /> Tanya WADAR Kenapa
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-2">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Tren Omzet vs Laba Bersih</h3>
          <FakeChart />
        </CardContent>
      </Card>
    </div>
  );
}
