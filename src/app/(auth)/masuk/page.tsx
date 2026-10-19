import { Suspense } from "react";
import { brand } from "@/brand";
import { DemoButtons } from "@/components/demo-buttons";
import { AuthShell } from "../_components/auth-shell";
import { MasukForm } from "./masuk-form";

export default function MasukPage() {
  return (
    <AuthShell title={`Masuk ke ${brand.name}`} subtitle="Kami kirim kode masuk ke emailmu. Belum punya akun? Email yang sama langsung jadi akun baru.">
      {/* The form reads ?next= and link errors from the URL, which is request-time data. */}
      <Suspense fallback={<div className="h-40" />}>
        <MasukForm />
      </Suspense>
      <div className="mt-10 flex flex-col gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          atau lihat dulu tanpa daftar
          <span className="h-px flex-1 bg-border" />
        </div>
        <p className="text-sm text-muted-foreground">Buka toko contoh lengkap dengan data 90 hari.</p>
        <DemoButtons variant="secondary" />
      </div>
    </AuthShell>
  );
}
