import { Button, Input, Card, CardContent } from "@wadar/ui-web";
import { Sparkles, Mic, Send, Bot, User, ArrowRight } from "lucide-react";

export default function AsistenPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] max-w-4xl mx-auto w-full relative">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32">
        {/* Empty State / Welcome Screen */}
        <div className="flex flex-col items-center justify-center mt-10 mb-8 space-y-4">
          <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
            <Sparkles className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">WADAR AI</h1>
            <p className="text-muted-foreground mt-1">Tanya apa saja tentang tokomu</p>
          </div>
        </div>

        {/* Suggested Prompts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto mb-12">
          {[
            "Kenapa laba saya turun minggu ini?",
            "Produk mana yang paling menguntungkan?",
            "Apa yang harus saya stok besok?",
            "Bagaimana performa penjualan hari ini?"
          ].map((prompt, i) => (
            <button key={i} className="text-left px-4 py-3 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted text-sm text-foreground transition-colors">
              {prompt}
            </button>
          ))}
        </div>

        {/* Example Chat Flow */}
        <div className="space-y-6 max-w-3xl mx-auto">
          {/* User Message */}
          <div className="flex justify-end gap-3">
            <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm">
              Kenapa laba saya turun minggu ini?
            </div>
            <div className="h-8 w-8 shrink-0 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
              <User className="h-4 w-4" />
            </div>
          </div>

          {/* AI Response */}
          <div className="flex gap-3">
            <div className="h-8 w-8 shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-3 w-full max-w-[85%]">
              <div className="bg-muted/50 border border-border/50 px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-foreground space-y-3">
                <p><strong>Laba kamu turun 8,4% minggu ini.</strong></p>
                <p>Penyebab utama adalah:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>HPP naik 6,2%</li>
                  <li>Diskon rata-rata naik 4,8%</li>
                  <li>Produk margin rendah menyumbang 31% dari total transaksi</li>
                </ul>
              </div>
              
              {/* Action Card inside Chat */}
              <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Saran WADAR
                  </h4>
                  <p className="text-xs text-muted-foreground mt-2">
                    Kurangi diskon Produk Serum Niacinamide dari 20% → 10% untuk mengembalikan margin ke batas sehat.
                  </p>
                  <Button size="sm" className="w-full mt-3 gap-2">
                    Simulasikan Dampaknya <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border">
        <div className="max-w-3xl mx-auto relative flex items-center">
          <Input 
            className="pr-24 pl-4 py-6 rounded-2xl bg-muted/50 border-border shadow-sm focus-visible:ring-primary/20" 
            placeholder="Tanya WADAR..." 
          />
          <div className="absolute right-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground rounded-full">
              <Mic className="h-5 w-5" />
            </Button>
            <Button size="icon" className="h-10 w-10 rounded-full shadow-sm">
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
