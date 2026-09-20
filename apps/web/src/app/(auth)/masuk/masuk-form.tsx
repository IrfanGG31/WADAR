"use client";

import { brand } from "@wadar/brand";
import { Button, Input, Label } from "@wadar/ui-web";
import { Radar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Channel = "email" | "phone";
type Step = "request" | "verify";

/**
 * Email OTP + Google get full, automatically-testable support. Phone (HP)
 * OTP's UI/flow is built the same way, but Supabase's SMS provider is left
 * unconfigured (design decision #8, M1 plan) — submitting it will surface
 * whatever error Supabase returns instead of silently pretending to work.
 */
export function MasukForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/onboarding";

  const [channel, setChannel] = useState<Channel>("email");
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleRequestOtp() {
    setLoading(true);
    setError(undefined);
    const supabase = createClient();
    const { error: otpError } =
      channel === "email"
        ? await supabase.auth.signInWithOtp({ email: identifier })
        : await supabase.auth.signInWithOtp({ phone: identifier });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setStep("verify");
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError(undefined);
    const supabase = createClient();
    const { error: verifyError } =
      channel === "email"
        ? await supabase.auth.verifyOtp({ email: identifier, token: code, type: "email" })
        : await supabase.auth.verifyOtp({ phone: identifier, token: code, type: "sms" });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.push(next);
  }

  async function handleGoogle() {
    setLoading(true);
    setError(undefined);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", next);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
    }
    // On success, Supabase redirects the browser away — nothing else to do here.
  }

  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      {/* Brand panel — hidden on mobile, sets tone on anything wider (PRD §4: tenang, diawasi, bukan sekadar mencatat). */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <Radar className="h-6 w-6" />
          {brand.name}
        </div>
        <p className="relative max-w-sm text-2xl font-medium leading-snug">{brand.tagline}</p>
        <p className="relative text-sm text-primary-foreground/70">
          Keuangan otomatis, operasional terpadu, dan asisten chat cerdas — satu langganan.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-1.5 md:mb-10">
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-primary md:hidden">
              <Radar className="h-6 w-6" />
              {brand.name}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Masuk ke {brand.name}</h1>
            <p className="text-sm text-muted-foreground">{brand.tagline}</p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => {
                  setChannel("email");
                  setStep("request");
                  setError(undefined);
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${channel === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannel("phone");
                  setStep("request");
                  setError(undefined);
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${channel === "phone" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                No. HP
              </button>
            </div>

            {step === "request" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="identifier">{channel === "email" ? "Alamat email" : "Nomor HP"}</Label>
                <Input
                  id="identifier"
                  type={channel === "email" ? "email" : "tel"}
                  placeholder={channel === "email" ? "nama@usaha.com" : "08123456789"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <Button
                  size="lg"
                  className="mt-1"
                  disabled={loading || identifier.length === 0}
                  onClick={handleRequestOtp}
                >
                  {loading ? "Mengirim..." : "Kirim kode OTP"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Kode OTP (6 digit)</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button size="lg" className="mt-1" disabled={loading || code.length === 0} onClick={handleVerifyOtp}>
                  {loading ? "Memverifikasi..." : "Verifikasi & Masuk"}
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("request")}
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Kirim ulang kode
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              atau
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" size="lg" disabled={loading} onClick={handleGoogle}>
              Lanjutkan dengan Google
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
