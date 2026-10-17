import { WifiOff } from "lucide-react";
import Link from "next/link";
import { brand } from "@/brand";

export const metadata = { title: "Sedang offline" };

/**
 * Shown by public/sw.js when a page can't load without a connection (precached, public in
 * src/proxy.ts). Static: no session, no shop data — nothing private is ever cached.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <WifiOff className="h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Kamu sedang offline</h1>
        <p className="text-muted-foreground">
          {brand.shortName} butuh internet untuk memuat data toko. Cek sinyal atau Wi-Fi, lalu coba lagi.
        </p>
        <Link
          href="/mulai"
          prefetch={false}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Coba lagi
        </Link>
      </div>
    </main>
  );
}
