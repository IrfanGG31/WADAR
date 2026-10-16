"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Body of every `error.tsx`. Never shows `error.message` (it can carry query
 * or table names); the digest is enough for the owner to quote and for us to
 * find the server log line.
 */
export function RouteError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where "Ke Beranda" leads; omitted outside a shop. */
  homeHref?: string;
}) {
  useEffect(() => {
    console.error("[route-error]", error.digest ?? "", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center"
    >
      <TriangleAlert className="h-10 w-10 text-warning" />
      <h1 className="text-lg font-semibold">Halaman ini belum bisa dimuat</h1>
      <p className="text-sm text-muted-foreground">
        Ada gangguan sebentar. Datamu aman. Coba muat ulang; kalau masih begini, tunggu sebentar lalu coba lagi.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Kode: {error.digest}</p>}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCw className="h-4 w-4" />
          Coba lagi
        </Button>
        {homeHref && (
          <Button asChild variant="outline">
            <Link href={homeHref}>Ke Beranda</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
