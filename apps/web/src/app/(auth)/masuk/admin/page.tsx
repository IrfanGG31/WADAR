import { brand } from "@wadar/brand";
import { AuthShell } from "../../_components/auth-shell";
import { AdminForm } from "./admin-form";

export default function MasukAdminPage() {
  return (
    <AuthShell title={`Masuk Admin ${brand.name}`} subtitle="Untuk pemilik dan admin toko — masuk dengan email dan kata sandi.">
      <AdminForm />
    </AuthShell>
  );
}
