import { Suspense } from "react";
import { brand } from "@/brand";
import { AuthShell } from "../_components/auth-shell";
import { MasukForm } from "./masuk-form";

export default function MasukPage() {
  return (
    <AuthShell title={`Masuk ke ${brand.name}`} subtitle="Kami kirim kode masuk ke email kamu — tanpa kata sandi.">
      {/* The form reads ?next= and link errors from the URL, which is request-time data. */}
      <Suspense fallback={<div className="h-40" />}>
        <MasukForm />
      </Suspense>
    </AuthShell>
  );
}
