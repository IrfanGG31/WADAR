import { AuthShell } from "../../_components/auth-shell";
import { SandiBaruForm } from "./sandi-baru-form";

export default function SandiBaruPage() {
  return (
    <AuthShell title="Buat kata sandi baru" subtitle="Setelah disimpan, kamu bisa masuk dengan email & kata sandi.">
      <SandiBaruForm />
    </AuthShell>
  );
}
