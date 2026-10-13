import { Radar } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/brand";
import { Button } from "@/components/ui/button";

/** Public landing page; signed-in visitors are redirected to their shop by src/proxy.ts. */
export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12 text-center">
      <Image src={brand.logo.src} alt={brand.logo.alt} width={160} height={160} className="h-auto w-32" priority />
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-semibold tracking-tight">
          <Radar className="h-7 w-7 text-primary" />
          {brand.name}
        </h1>
        <p className="text-muted-foreground">{brand.tagline}</p>
      </div>
      <Button asChild size="lg" className="w-full max-w-xs">
        <Link href="/masuk">Masuk / Daftar</Link>
      </Button>
    </main>
  );
}
