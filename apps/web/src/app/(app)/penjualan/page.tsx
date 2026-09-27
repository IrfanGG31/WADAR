import { Card, CardContent, Button, Badge } from "@wadar/ui-web";
import { Search, Filter, Download, Plus, Bot, Clock, CheckCircle2, ChevronRight, Package } from "lucide-react";
import { DesignPreviewNotice } from "../_components/design-preview-notice";

export default function PesananPage() {
  return (
    <>
      <DesignPreviewNotice milestone="M7" />
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Penjualan & Transaksi</h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola pesanan dari semua channel jualanmu.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Buat Pesanan
          </Button>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">Menunggu Pembayaran</p>
            <h3 className="text-2xl font-bold text-amber-600">12</h3>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">Perlu Dikirim</p>
            <h3 className="text-2xl font-bold text-blue-600">8</h3>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">Selesai (Hari Ini)</p>
            <h3 className="text-2xl font-bold text-emerald-600">34</h3>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex flex-col gap-1">
            <p className="text-xs font-medium text-primary flex items-center gap-1 uppercase">
              <Bot className="h-3 w-3" /> AI Action
            </p>
            <h3 className="text-sm font-semibold mt-1">Ada 5 tagihan WA belum dibayar</h3>
            <Button variant="ghost" className="p-0 h-auto text-xs justify-start mt-1 text-primary hover:bg-transparent hover:underline">Kirim Reminder</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="px-3 py-1">Semua</Badge>
            <Badge variant="outline" className="px-3 py-1 bg-muted/50">WhatsApp (18)</Badge>
            <Badge variant="outline" className="px-3 py-1 bg-muted/50">Shopee (12)</Badge>
            <Badge variant="outline" className="px-3 py-1 bg-muted/50">Kasir (24)</Badge>
          </div>
          <div className="flex items-center gap-2 relative">
            <Search className="h-4 w-4 absolute left-2.5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Cari pesanan..." 
              className="h-9 w-full sm:w-[250px] rounded-md border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"><Filter className="h-4 w-4" /></Button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-4 py-3">ID Pesanan</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { id: "INV-202609-112", name: "Sari Indah", channel: "WhatsApp", total: "Rp 345.000", status: "menunggu", items: 2 },
                { id: "INV-202609-111", name: "Budi Santoso", channel: "Kasir", total: "Rp 120.000", status: "selesai", items: 1 },
                { id: "SHP-892348923", name: "Rina M.", channel: "Shopee", total: "Rp 540.000", status: "dikirim", items: 4 },
                { id: "INV-202609-110", name: "Andi Wijaya", channel: "WhatsApp", total: "Rp 85.000", status: "menunggu", items: 1 },
                { id: "INV-202609-109", name: "Toko Sebelah", channel: "Kasir", total: "Rp 1.250.000", status: "selesai", items: 12 },
              ].map((order, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-primary cursor-pointer hover:underline">{order.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.name}</div>
                    <div className="text-xs text-muted-foreground">{order.items} produk</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-background text-xs font-normal">
                      {order.channel}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{order.total}</td>
                  <td className="px-4 py-3">
                    {order.status === "menunggu" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                        <Clock className="h-3 w-3" /> Menunggu Pembayaran
                      </span>
                    )}
                    {order.status === "dikirim" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                        <Package className="h-3 w-3" /> Sedang Dikirim
                      </span>
                    )}
                    {order.status === "selesai" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Selesai
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.status === "menunggu" ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-primary border-primary/30">
                        <Bot className="h-3 w-3" /> Ingatkan
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
    </>
  );
}
