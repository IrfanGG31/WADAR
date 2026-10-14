import { DemoButtons } from "@/components/demo-buttons";
import { AuthShell } from "../_components/auth-shell";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Buat toko" };

export default function OnboardingPage() {
  return (
    <AuthShell title="Buat tokomu" subtitle="Tiga isian saja. Kanal jualan dan komisinya kami siapkan otomatis.">
      <OnboardingForm />
      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">Belum siap? Lihat dulu toko contoh dengan data 90 hari.</p>
        <DemoButtons />
      </div>
    </AuthShell>
  );
}
