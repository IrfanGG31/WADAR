import { AlertTriangle, MessageCircle, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { brand } from "@/brand";
import { BrandLockup } from "@/components/ui/saa-s-template";

/** What the product does, shown as the notices an owner actually gets — sample shop wording, no stock art. */
const SAMPLES = [
  { icon: AlertTriangle, tone: "text-red-700 bg-red-50", title: "Serum Vit C habis ±3 hari lagi", body: "Pesan ulang 40 pcs sebelum Kamis." },
  { icon: TrendingUp, tone: "text-emerald-700 bg-emerald-50", title: "Untung bersih minggu ini Rp5,7 jt", body: "Setelah modal, komisi Shopee, dan pengeluaran." },
  { icon: MessageCircle, tone: "text-primary bg-muted", title: "12 chat pembeli dijawab hari ini", body: "2 diteruskan ke kamu: minta diskon grosir." },
] as const;

/** Two-column sign-in layout: product panel on wide screens, form on the right. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between border-r border-border bg-surface p-10 lg:flex xl:p-14">
        <BrandLockup />
        <div className="flex max-w-md flex-col gap-8">
          <p className="font-display text-3xl font-bold leading-tight tracking-tight text-navy">{brand.tagline}</p>
          <ul className="flex flex-col gap-3" aria-label="Contoh pemberitahuan">
            {SAMPLES.map((s) => (
              <li key={s.title} className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.tone}`}>
                  <s.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{s.title}</span>
                  <span className="text-sm text-muted-foreground">{s.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">Contoh dari toko contoh. Angka tokomu dihitung dari transaksimu sendiri.</p>
      </aside>

      <div className="flex flex-col px-4 py-6 sm:px-8 lg:justify-center lg:py-12">
        <BrandLockup className="mb-10 lg:hidden" />
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-navy">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
