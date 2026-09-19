"use client";

import { brand } from "@wadar/brand";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@wadar/ui-web";
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
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Masuk ke {brand.name}</CardTitle>
          <CardDescription>{brand.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-2 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => {
                setChannel("email");
                setStep("request");
                setError(undefined);
              }}
              className={`flex-1 rounded-sm py-1.5 text-sm font-medium ${channel === "email" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
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
              className={`flex-1 rounded-sm py-1.5 text-sm font-medium ${channel === "phone" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
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
              <Button disabled={loading || identifier.length === 0} onClick={handleRequestOtp}>
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
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button disabled={loading || code.length === 0} onClick={handleVerifyOtp}>
                {loading ? "Memverifikasi..." : "Verifikasi & Masuk"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("request")}
                className="text-sm text-muted-foreground underline"
              >
                Kirim ulang kode
              </button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            atau
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" disabled={loading} onClick={handleGoogle}>
            Lanjutkan dengan Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
