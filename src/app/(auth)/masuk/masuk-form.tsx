"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeAuthError } from "@/lib/auth-errors";
import { fetchAuthAvailability, type AuthAvailability } from "@/lib/auth-settings";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

type Step = "request" | "verify";

const LINK_ERROR_MESSAGES: Record<string, string> = {
  otp_expired: "Link masuk ini sudah kedaluwarsa atau sudah dipakai. Kirim ulang, lalu klik link-nya secepatnya.",
  access_denied: "Link masuk ini tidak valid lagi. Coba kirim ulang.",
  auth_callback_failed: "Gagal memverifikasi link masuk. Coba kirim ulang.",
  demo_unavailable: "Mode demo sedang tidak tersedia. Coba lagi beberapa menit lagi.",
  demo_failed: "Toko contoh gagal disiapkan. Coba sekali lagi.",
  demo_busy: "Terlalu banyak toko contoh dibuat dari jaringan ini. Coba lagi sejam lagi, atau masuk dengan akunmu.",
};

/** Email OTP (code or magic link) + Google (hidden until it is enabled in Supabase). */
export function MasukForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const linkErrorCode = searchParams.get("error_code") ?? searchParams.get("error");
  const linkError = linkErrorCode
    ? (LINK_ERROR_MESSAGES[linkErrorCode] ?? searchParams.get("error_description") ?? undefined)
    : undefined;

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(linkError);
  const [available, setAvailable] = useState<AuthAvailability | undefined>();

  useEffect(() => {
    void fetchAuthAvailability().then(setAvailable);
  }, []);

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    // emailRedirectTo: Supabase's default template sends a link (not a code);
    // it lands on /auth/callback, which exchanges the PKCE code for a session.
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (otpError) {
      setError(describeAuthError(otpError));
      return;
    }
    setStep("verify");
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    const { error: verifyError } = await createClient().auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (verifyError) {
      setError(describeAuthError(verifyError));
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleGoogle() {
    setLoading(true);
    setError(undefined);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) {
      setLoading(false);
      setError(describeAuthError(oauthError));
    }
    // On success the browser is redirected to Google.
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "request" ? (
        <form className="flex flex-col gap-2" onSubmit={handleRequest}>
          <Label htmlFor="email">Alamat email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nama@usaha.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" className="mt-1" disabled={loading || email.length === 0}>
            {loading ? "Mengirim..." : "Kirim kode masuk"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={handleVerify}>
          <p className="mb-1 text-sm text-muted-foreground">
            Cek email <span className="font-medium text-foreground">{email}</span> — klik link masuk di dalamnya, atau
            ketik kodenya di sini.
          </p>
          <Label htmlFor="code">Kode (6 digit)</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" size="lg" className="mt-1" disabled={loading || code.length === 0}>
            {loading ? "Memeriksa..." : "Masuk"}
          </Button>
          <button
            type="button"
            onClick={() => setStep("request")}
            className="min-h-11 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Kirim ulang kode
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {available?.google !== false && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            atau
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" size="lg" disabled={loading} onClick={handleGoogle}>
            Lanjutkan dengan Google
          </Button>
        </>
      )}

      <Link
        href="/masuk/admin"
        className="min-h-11 pt-2 text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Punya kata sandi? Masuk dengan email &amp; kata sandi
      </Link>
    </div>
  );
}
