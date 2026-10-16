"use client";

import { brand } from "@/brand";

/** Last resort when the root layout itself fails: plain markup, no providers, no app components. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", minHeight: "100dvh", placeItems: "center", margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>{brand.name} sedang bermasalah</h1>
          <p style={{ color: "#475569" }}>Datamu aman. Muat ulang halaman ini sebentar lagi.</p>
          <button
            type="button"
            onClick={reset}
            style={{ height: 44, padding: "0 20px", border: 0, borderRadius: 6, background: brand.colors.primary, color: brand.colors.primaryForeground, fontSize: 14, fontWeight: 500 }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
