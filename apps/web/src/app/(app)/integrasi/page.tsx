import { Card, CardContent, Button, Badge } from "@wadar/ui-web";
import { MessageSquare, Store, Database, CreditCard, Building2, CheckCircle2, AlertCircle } from "lucide-react";

export default function IntegrasiPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrasi Platform</h1>
          <p className="text-sm text-muted-foreground mt-1">Hubungkan toko, POS, dan channel komunikasi Anda ke WADAR.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Connected Integration */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardContent className="p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="h-12 w-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                <MessageSquare className="h-6 w-6" />
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 flex items-center">
                <CheckCircle2 className="h-3 w-3" /> Aktif
              </Badge>
            </div>
            <h3 className="font-bold text-lg mb-2">WhatsApp Business</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Otomatiskan balasan chat, kirim tagihan, dan update status pesanan langsung melalui nomor resmi Meta API.
            </p>
            <div className="mt-auto flex gap-3 pt-4 border-t border-border/50">
              <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white">Putuskan</Button>
              <Button variant="outline" className="flex-1">Pengaturan</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm flex flex-col">
          <CardContent className="p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="h-12 w-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                <Store className="h-6 w-6" />
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 flex items-center">
                <CheckCircle2 className="h-3 w-3" /> Aktif
              </Badge>
            </div>
            <h3 className="font-bold text-lg mb-2">Shopee</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Sinkronisasi stok, pesanan otomatis, dan pantau metrik penjualan Shopee Anda dalam satu dashboard WADAR.
            </p>
            <div className="mt-auto flex gap-3 pt-4 border-t border-border/50">
              <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white">Putuskan</Button>
              <Button variant="outline" className="flex-1">Pengaturan</Button>
            </div>
          </CardContent>
        </Card>

        {/* Not Connected Integrations */}
        <Card className="border-border shadow-sm flex flex-col bg-muted/20 border-dashed">
          <CardContent className="p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center opacity-70">
                <Database className="h-6 w-6" />
              </div>
            </div>
            <h3 className="font-bold text-lg mb-2">Moka POS</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Hubungkan sistem kasir Moka untuk mendapatkan WADAR Finance Insight & Stock Intelligence dari toko fisik Anda.
            </p>
            <div className="mt-auto pt-4 border-t border-border/50">
              <Button className="w-full bg-primary hover:bg-primary/90 text-white">Hubungkan Moka POS</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm flex flex-col bg-muted/20 border-dashed">
          <CardContent className="p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="h-12 w-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center opacity-70">
                <Store className="h-6 w-6" />
              </div>
              <Badge variant="muted" className="gap-1.5 flex items-center bg-amber-100 text-amber-700 hover:bg-amber-100">
                <AlertCircle className="h-3 w-3" /> Perlu Update
              </Badge>
            </div>
            <h3 className="font-bold text-lg mb-2">Tokopedia</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Kelola pesanan Tokopedia Anda. Harap perbarui token API Anda yang telah kedaluwarsa.
            </p>
            <div className="mt-auto pt-4 border-t border-border/50">
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white">Perbarui Koneksi</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
