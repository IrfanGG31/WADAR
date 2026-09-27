import { brand } from "@wadar/brand";
import { Radar } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

/** Two-column sign-in layout (brand panel on wide screens) shared by the password pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <Radar className="h-6 w-6" />
          {brand.name}
        </div>
        <p className="relative max-w-sm text-2xl font-medium leading-snug">{brand.tagline}</p>
        <p className="relative text-sm text-primary-foreground/70">
          Keuangan otomatis, operasional terpadu, dan asisten chat cerdas — satu langganan.
        </p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-1.5 md:mb-10">
            <div className="mb-2 flex items-center md:hidden">
              <Image src={brand.logo.src} alt={brand.logo.alt} width={120} height={120} className="h-auto w-24" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
