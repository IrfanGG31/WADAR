import { Input, Button, Avatar, AvatarFallback } from "@wadar/ui-web";
import { Search, Filter, Phone, MoreVertical, Send, Check, Bot, CheckCheck, Paperclip } from "lucide-react";
import { DesignPreviewNotice } from "../_components/design-preview-notice";
import { brand } from "@wadar/brand";

export default function PelangganPage() {
  return (
    <>
      <DesignPreviewNotice milestone="M7–M9" />
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* Left Panel: Inbox List */}
      <div className="w-full md:w-80 lg:w-96 border-r border-border flex flex-col h-full bg-muted/10">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">Pelanggan</h1>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Filter className="h-4 w-4" /></Button>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 bg-background h-9 text-sm rounded-full" placeholder="Cari nama atau chat..." />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button className="whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive" /> Perlu dibalas (12)
            </button>
            <button className="whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-600" /> Menunggu (5)
            </button>
            <button className="whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium bg-background border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5">
              Selesai (34)
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {/* Active Chat Item */}
          <div className="p-4 bg-primary/5 cursor-pointer relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
            <div className="flex gap-3">
              <div className="relative">
                <Avatar className="h-12 w-12 border border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">SA</AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-background rounded-full"></div>
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-start mb-0.5">
                  <h4 className="font-semibold text-sm truncate pr-2">Sari Indah</h4>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">10:42</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">Harga serum yang 30ml berapa kak?</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-1">
                    <Bot className="h-3 w-3" /> {brand.name} mereply...
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Other Chat Items */}
          {[
            { name: "Dimas", time: "09:15", msg: "Barang saya sudah dikirim?", state: "warning" },
            { name: "Toko Sebelah", time: "Kemarin", msg: "Terima kasih bos", state: "done" },
            { name: "Ayu Kusumawati", time: "Kemarin", msg: "Bisa COD gak?", state: "urgent" },
          ].map((chat, i) => (
            <div key={i} className="p-4 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="flex gap-3">
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>{chat.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {chat.state === "urgent" && <div className="absolute bottom-0 right-0 h-3 w-3 bg-destructive border-2 border-background rounded-full"></div>}
                  {chat.state === "warning" && <div className="absolute bottom-0 right-0 h-3 w-3 bg-amber-500 border-2 border-background rounded-full"></div>}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-start mb-0.5">
                    <h4 className="font-semibold text-sm truncate pr-2">{chat.name}</h4>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">{chat.time}</span>
                  </div>
                  <p className={`text-xs truncate ${chat.state === "urgent" ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{chat.msg}</p>
                  {chat.state === "done" && (
                     <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                       <CheckCheck className="h-3 w-3 text-blue-500" /> {brand.name} AI
                     </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel: Chat Area */}
      <div className="hidden md:flex flex-1 flex-col h-full bg-background relative">
        {/* Chat Header */}
        <div className="h-16 px-6 border-b border-border flex items-center justify-between shrink-0 bg-background/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary font-bold">SA</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-sm leading-none mb-1">Sari Indah</h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-green-600"><Phone className="h-3 w-3" /> WhatsApp</span>
                <span>•</span>
                <span>Customer sejak Jan 2026</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden lg:flex text-xs h-8">Lihat Pesanan (2)</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MoreVertical className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          <div className="text-center">
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">Hari Ini</span>
          </div>

          {/* Customer Message */}
          <div className="flex items-start gap-3">
            <Avatar className="h-8 w-8 shrink-0 border border-border mt-1">
              <AvatarFallback className="text-xs bg-white text-muted-foreground">SA</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1 items-start">
              <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-sm max-w-[85%]">
                Halo {brand.name}, saya mau tanya.
              </div>
              <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-sm max-w-[85%]">
                Harga serum yang 30ml berapa kak?
              </div>
              <span className="text-[10px] text-muted-foreground ml-1">10:42</span>
            </div>
          </div>

          {/* WADAR AI Draft Response */}
          <div className="flex items-start gap-3 flex-row-reverse">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1 shadow-sm">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col gap-1 items-end max-w-[75%]">
              <div className="bg-primary/10 border border-primary/20 text-foreground rounded-2xl rounded-tr-sm px-4 py-3 text-sm relative">
                Halo Kak Sari! 👋<br/><br/>
                Untuk Serum Niacinamide ukuran 30ml harganya saat ini <strong>Rp 89.000</strong> ya kak.<br/>
                Stoknya sisa 8 unit lagi nih. Mau saya bantu buatkan pesanannya sekarang?
                
                <div className="mt-3 pt-3 border-t border-primary/20 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100/50 w-fit px-2 py-1 rounded">
                    <Check className="h-3 w-3" /> Berdasarkan Katalog & Data Stok
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" className="h-7 text-xs bg-primary hover:bg-primary/90 flex-1">Kirim Jawaban AI</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-primary/30 text-primary">Edit</Button>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground mr-1 flex items-center gap-1">Draft oleh AI <Bot className="h-3 w-3" /></span>
            </div>
          </div>
        </div>

        {/* Chat Input */}
        <div className="p-4 bg-background border-t border-border shrink-0">
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl p-1 pr-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground rounded-lg shrink-0">
              <Paperclip className="h-5 w-5" />
            </Button>
            <textarea 
              className="flex-1 bg-transparent border-none text-sm resize-none focus:outline-none min-h-[40px] max-h-[120px] py-2.5 placeholder:text-muted-foreground"
              placeholder="Ketik balasan manual jika perlu..."
              rows={1}
            />
            <Button size="icon" className="h-10 w-10 rounded-lg shrink-0">
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
