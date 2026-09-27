"use client";

import { Button, Input, Label } from "@wadar/ui-web";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { describeAuthError } from "../../../../lib/auth-errors";
import { createClient } from "../../../../lib/supabase/client";

const MIN_LENGTH = 8;

/**
 * Set or change the password of the signed-in user — reached from the
 * "Lupa kata sandi?" email link (via /auth/callback, which signs the user in
 * first) or from the account menu.
 */
export function SandiBaruForm() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | undefined>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(data.user !== null && data.user.is_anonymous !== true));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (password.length < MIN_LENGTH) {
      setError(`Kata sandi minimal ${MIN_LENGTH} karakter.`);
      return;
    }
    if (password !== confirm) {
      setError("Kedua kata sandi belum sama.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(describeAuthError(updateError));
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  if (signedIn === undefined) {
    return <p className="text-sm text-muted-foreground">Memeriksa sesi…</p>;
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Link ini sudah tidak berlaku atau kamu belum masuk. Minta link baru lewat “Lupa kata sandi?”.
        </p>
        <Link href="/masuk/admin" className="text-sm text-primary underline underline-offset-2">
          Kembali ke Masuk Admin
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">Kata sandi baru</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Minimal {MIN_LENGTH} karakter, campur huruf dan angka.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Ulangi kata sandi baru</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={loading || !password || !confirm}>
        {loading ? "Menyimpan..." : "Simpan kata sandi"}
      </Button>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </form>
  );
}
