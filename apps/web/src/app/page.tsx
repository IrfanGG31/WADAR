import Link from "next/link";
import Image from "next/image";
import { Button } from "@wadar/ui-web";
import { brand } from "@wadar/brand";
import { DemoButton } from "../components/demo-button";
import { ArrowRight, Bot, BarChart3, Package } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="px-6 lg:px-14 h-20 flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center">
          <Image src={brand.logo.src} alt={brand.logo.alt} width={140} height={140} className="w-24 h-auto" />
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
          <Link href="#fitur" className="hover:text-foreground transition-colors">Fitur</Link>
          <Link href="#solusi" className="hover:text-foreground transition-colors">Solusi</Link>
          <Link href="#harga" className="hover:text-foreground transition-colors">Harga</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/masuk" className="text-sm font-semibold hover:text-primary transition-colors">Masuk</Link>
          <Link href="/daftar">
            <Button className="rounded-full px-6">Mulai Gratis</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-6 lg:px-14 py-24 md:py-32 flex flex-col items-center text-center overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/10 rounded-[100%] blur-[120px] pointer-events-none" />
          
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <SparklesIcon className="w-4 h-4" />
            <span>AI generasi terbaru untuk UMKM</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl text-foreground leading-[1.1]">
            Asisten AI yang <span className="text-primary">mengerti</span> tokomu.
          </h1>
          
          <p className="mt-6 text-xl text-muted-foreground max-w-2xl leading-relaxed">
            {brand.tagline}
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/daftar">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-full gap-2">
                Coba Gratis 14 Hari <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <DemoButton label="Lihat Demo" className="w-full sm:w-auto h-14 px-8 text-base rounded-full" />
          </div>
        </section>

        {/* Feature Highlights */}
        <section id="fitur" className="px-6 lg:px-14 py-24 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight">Lebih dari sekadar POS biasa</h2>
              <p className="mt-4 text-muted-foreground">Ubah data menjadi keputusan bisnis yang lebih baik.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-background p-8 rounded-2xl border border-border shadow-sm">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Stock Intelligence</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Bukan cuma tabel stok. AI memprediksi kapan barang habis dan memberikan rekomendasi jumlah reorder yang akurat.
                </p>
              </div>
              
              <div className="bg-background p-8 rounded-2xl border border-border shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Bot className="w-32 h-32" /></div>
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-6 relative z-10">
                  <Bot className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3 relative z-10">Customer Chat RAG</h3>
                <p className="text-muted-foreground leading-relaxed relative z-10">
                  Balas chat pelanggan otomatis berdasarkan katalog, stok, dan kebijakan retur tokomu secara *real-time*.
                </p>
              </div>
              
              <div className="bg-background p-8 rounded-2xl border border-border shadow-sm">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Finance Insight</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Tahu pasti penyebab laba naik atau turun. AI menjelaskan kondisi keuangan dengan bahasa manusia yang mudah dimengerti.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="px-6 lg:px-14 py-12 border-t border-border bg-background text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center">
          <Image src={brand.logo.src} alt={brand.logo.alt} width={140} height={140} className="w-24 h-auto" />
        </div>
        <p className="text-sm text-muted-foreground">© 2026 {brand.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
