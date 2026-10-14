import { Suspense } from "react";
import { brand } from "@/brand";
import { DemoButtons } from "@/components/demo-buttons";
import { AuthShell } from "../_components/auth-shell";
import { MasukForm } from "./masuk-form";

export default function MasukPage() {
  return (
    <AuthShell title={`Masuk ke ${brand.name}`} subtitle="Kami kirim kode masuk ke email kamu — tanpa kata sandi.">
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div>
          <p className="font-semibold">Mau lihat dulu?</p>
          <p className="text-sm text-muted-foreground">Buka toko contoh lengkap dengan data 90 hari — tanpa daftar.</p>
        </div>
        <DemoButtons />
      </div>
      {/* The form reads ?next= and link errors from the URL, which is request-time data. */}
      <Suspense fallback={<div className="h-40" />}>
        <MasukForm />
      </Suspense>
    </AuthShell>
  );
}
