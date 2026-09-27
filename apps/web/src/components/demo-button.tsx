"use client";

import { Button } from "@wadar/ui-web";
import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_STEP_LABEL, DemoError, startDemoShop, type DemoStep } from "../lib/demo";

/** "Coba demo" — one tap to a working sample shop, no email or password needed. */
export function DemoButton({
  label = "Coba demo tanpa daftar",
  variant = "outline",
  className,
}: {
  label?: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<DemoStep | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function handleClick() {
    setError(undefined);
    try {
      await startDemoShop(setStep);
      router.push("/beranda");
      router.refresh();
    } catch (err) {
      setStep(undefined);
      setError(err instanceof DemoError ? err.message : "Demo belum bisa dibuka. Coba lagi sebentar lagi.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" variant={variant} className={className} disabled={step !== undefined} onClick={handleClick}>
        <PlayCircle className="mr-2 h-4 w-4" />
        {step ? DEMO_STEP_LABEL[step] : label}
      </Button>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
