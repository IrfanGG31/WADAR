"use client";

import { Coffee, Loader2, Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { startDemo } from "@/app/demo-actions";
import { Button } from "@/components/ui/button";

function DemoSubmit({ profile, label, icon: Icon, variant }: {
  profile: "skincare" | "kopi";
  label: string;
  icon: typeof Sparkles;
  variant: "default" | "outline";
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("profile") === profile;
  return (
    <Button type="submit" name="profile" value={profile} variant={variant} size="lg" disabled={pending} className="w-full">
      {mine ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {mine ? "Menyiapkan toko contoh..." : label}
    </Button>
  );
}

/**
 * "Coba demo": a fresh sample shop with 90 days of data, no sign-up needed.
 * `secondary` when it sits under a sign-in form, so it does not compete with the main action.
 */
export function DemoButtons({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <form action={startDemo} className="flex flex-col gap-2">
      <DemoSubmit profile="skincare" label="Coba demo: toko skincare" icon={Sparkles} variant={variant === "primary" ? "default" : "outline"} />
      <DemoSubmit profile="kopi" label="Coba demo: kedai kopi" icon={Coffee} variant="outline" />
    </form>
  );
}
