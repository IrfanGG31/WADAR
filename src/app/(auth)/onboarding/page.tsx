import { AuthShell } from "../_components/auth-shell";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Buat toko" };

export default function OnboardingPage() {
  return (
    <AuthShell title="Buat tokomu" subtitle="Tiga isian saja. Kanal jualan dan komisinya kami siapkan otomatis.">
      <OnboardingForm />
    </AuthShell>
  );
}
