"use client";

import { Button, Input, Label } from "@wadar/ui-web";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { describeAuthError } from "../../../../lib/auth-errors";
import { createClient } from "../../../../lib/supabase/client";

/**
 * Email + password sign-in for owners/admins. Needs no email delivery, so it
 * keeps working while the OTP email provider is down. After signing in,
 * /onboarding reopens the user's existing shop (GET /v1/tenants/mine).
 */
export function AdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError(describeAuthError(signInError));
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Isi alamat email dulu, lalu klik “Lupa kata sandi?” lagi.");
      return;
    }
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", "/masuk/sandi-baru");
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo.toString(),
    });
    setLoading(false);
    if (resetError) {
      setError(describeAuthError(resetError));
      return;
    }
    setNotice(`Kalau ${email} terdaftar, link untuk membuat kata sandi baru sudah dikirim. Cek kotak masuk (dan folder spam).`);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-email">Alamat email</Label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="username"
          placeholder="nama@usaha.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="admin-password">Kata sandi</Label>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            Lupa kata sandi?
          </button>
        </div>
        <div className="relative">
          <Input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={loading || !email || !password}>
        {loading ? "Memproses..." : "Masuk"}
      </Button>

      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">{notice}</p>}

      <Link href="/masuk" className="text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
        Masuk dengan kode email atau coba demo
      </Link>
    </form>
  );
}
