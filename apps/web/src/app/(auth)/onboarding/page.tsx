"use client";

import { CreateTenantBody, type TenantTimezone } from "@wadar/contracts/identity";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../lib/api-client";
import { setActiveTenantId } from "../../../lib/tenant-cookie";
import { brand } from "@wadar/brand";
import { Check, ChevronRight, Upload, Building2, Store, MessageSquare, Database } from "lucide-react";

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Form State
  const [tenantName, setTenantName] = useState("");
  const [category, setCategory] = useState("fashion");
  const [omzet, setOmzet] = useState("10-50");
  const [channels, setChannels] = useState<string[]>(["whatsapp", "instagram"]);

  async function handleFinish() {
    setLoading(true);
    setError(undefined);

    // Provide default outlet and timezone for now since it's removed from Step 1
    const parsed = CreateTenantBody.safeParse({ tenantName, outletName: "Pusat", timezone: "Asia/Jakarta" });
    if (!parsed.success) {
      setLoading(false);
      setError(parsed.error.issues[0]?.message ?? "Data belum lengkap.");
      return;
    }

    try {
      const result = await apiFetch<{ tenantId: string }>("/v1/tenants", {
        method: "POST",
        body: parsed.data,
        skipTenant: true,
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveTenantId(result.tenantId);
      router.push("/beranda");
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : "Gagal membuat toko.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-muted/30">
      <div className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
        <div className="text-xl font-bold text-primary tracking-tight flex items-center gap-2">
          {brand.name}
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          Langkah {step} dari 5
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {step === 1 && (
          <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Selamat datang di WADAR 👋</h1>
              <p className="text-muted-foreground">Mari kenalkan tokomu agar AI bisa mulai belajar.</p>
            </div>
            
            <Card className="shadow-lg border-primary/10">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label>Nama Toko</Label>
                  <Input 
                    placeholder="Contoh: Toko Makmur Jaya" 
                    value={tenantName} 
                    onChange={(e) => setTenantName(e.target.value)} 
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kategori Bisnis</Label>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-12 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="fashion">Fashion & Apparel</option>
                    <option value="fb">F&B / Kuliner</option>
                    <option value="beauty">Skincare & Beauty</option>
                    <option value="retail">Retail Umum</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Berapa omzet rata-rata bulanan?</Label>
                  <select 
                    value={omzet}
                    onChange={(e) => setOmzet(e.target.value)}
                    className="flex h-12 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="<10">&lt; Rp10 juta</option>
                    <option value="10-50">Rp10 juta - Rp50 juta</option>
                    <option value="50-100">Rp50 juta - Rp100 juta</option>
                    <option value=">100">&gt; Rp100 juta</option>
                  </select>
                </div>
                <Button 
                  className="w-full h-12 mt-4 text-base" 
                  disabled={!tenantName} 
                  onClick={() => setStep(2)}
                >
                  Lanjutkan <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 2 && (
          <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Di mana kamu berjualan?</h1>
              <p className="text-muted-foreground">Pilih channel penjualan utamamu (bisa lebih dari satu).</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
                { id: "instagram", label: "Instagram", icon: Store },
                { id: "shopee", label: "Shopee", icon: Building2 },
                { id: "tiktok", label: "TikTok Shop", icon: Store },
                { id: "fisik", label: "Toko Fisik", icon: Building2 },
                { id: "web", label: "Website Sendiri", icon: Store },
              ].map(ch => {
                const selected = channels.includes(ch.id);
                return (
                  <button 
                    key={ch.id}
                    onClick={() => {
                      if (selected) setChannels(channels.filter(c => c !== ch.id));
                      else setChannels([...channels, ch.id]);
                    }}
                    className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${selected ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/30'}`}
                  >
                    <ch.icon className="h-8 w-8 mb-3" />
                    <span className="font-semibold text-sm">{ch.label}</span>
                    {selected && <div className="absolute top-2 right-2"><Check className="h-4 w-4" /></div>}
                  </button>
                )
              })}
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" className="h-12 w-full" onClick={() => setStep(1)}>Kembali</Button>
              <Button className="h-12 w-full" onClick={() => setStep(3)}>
                Lanjutkan <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Hubungkan Sumber Data</h1>
              <p className="text-muted-foreground">Otomatiskan pencatatan dari berbagai platform.</p>
            </div>
            
            <Card className="shadow-sm">
              <CardContent className="p-0 divide-y divide-border">
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary"><Database className="h-5 w-5"/></div>
                    <div>
                      <h4 className="font-semibold">Sistem POS / Kasir</h4>
                      <p className="text-xs text-muted-foreground">Moka, Majoo, Pawoon</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Hubungkan</Button>
                </div>
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600"><Store className="h-5 w-5"/></div>
                    <div>
                      <h4 className="font-semibold">Marketplace</h4>
                      <p className="text-xs text-muted-foreground">Shopee, Tokopedia</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Import CSV</Button>
                </div>
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600"><MessageSquare className="h-5 w-5"/></div>
                    <div>
                      <h4 className="font-semibold">WhatsApp Business</h4>
                      <p className="text-xs text-muted-foreground">Koneksi API resmi Meta</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Hubungkan</Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="h-12 w-full" onClick={() => setStep(2)}>Kembali</Button>
              <Button className="h-12 w-full" onClick={() => setStep(4)}>
                Nanti Saja <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Ajarkan WADAR tentang tokomu</h1>
              <p className="text-muted-foreground">Upload file agar Customer Chat WADAR bisa menjawab akurat sesuai kebijakan toko.</p>
            </div>
            
            <div className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center text-center bg-background hover:bg-muted/50 transition-colors cursor-pointer">
              <Upload className="h-10 w-10 text-primary mb-4" />
              <h4 className="font-semibold mb-1">Klik untuk upload dokumen</h4>
              <p className="text-xs text-muted-foreground max-w-[250px]">
                PDF, Excel, Word (Katalog, Harga, Kebijakan Retur, FAQ, Jam Operasional)
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="h-12 w-full" onClick={() => setStep(3)}>Kembali</Button>
              <Button className="h-12 w-full" onClick={() => setStep(5)}>
                Lanjutkan <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-4">
              <div className="mx-auto h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-sm">
                <Check className="h-10 w-10" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Toko kamu siap.</h1>
            </div>
            
            <Card className="border-green-100 bg-green-50 shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap gap-4 font-medium text-sm">
                  <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-600" /> 128 produk</span>
                  <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-600" /> 342 transaksi</span>
                  <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-600" /> Knowledge Base aktif</span>
                </div>
              </CardContent>
            </Card>

            <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
              <h4 className="font-bold text-primary flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4" /> WADAR menemukan:
              </h4>
              <ul className="space-y-2 text-sm font-medium">
                <li className="flex items-center gap-2 text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> 7 produk stok rendah
                </li>
                <li className="flex items-center gap-2 text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" /> 3 produk margin rendah
                </li>
                <li className="flex items-center gap-2 text-blue-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> 24 chat belum terjawab
                </li>
              </ul>
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <Button size="lg" className="w-full h-14 text-base" onClick={handleFinish} disabled={loading}>
              {loading ? "Memproses..." : "Masuk ke Dashboard"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
