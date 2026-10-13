import { AuthShell } from "../../_components/auth-shell";
import { AdminForm } from "./admin-form";

export default function MasukAdminPage() {
  return (
    <AuthShell title="Masuk dengan kata sandi" subtitle="Untuk pemilik toko yang sudah membuat kata sandi.">
      <AdminForm />
    </AuthShell>
  );
}
