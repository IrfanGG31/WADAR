"use client";

import { CreateTenantBody, type TenantTimezone } from "@wadar/contracts/identity";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../lib/api-client";
import { setActiveTenantId } from "../../../lib/tenant-cookie";

const TIMEZONES: { value: TenantTimezone; label: string }[] = [
  { value: "Asia/Jakarta", label: "WIB — Jakarta" },
  { value: "Asia/Makassar", label: "WITA — Makassar" },
  { value: "Asia/Jayapura", label: "WIT — Jayapura" },
];

interface CreateTenantResponse {
  tenantId: string;
  outletId: string;
  membershipId: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [outletName, setOutletName] = useState("");
  const [timezone, setTimezone] = useState<TenantTimezone>("Asia/Jakarta");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit() {
    setLoading(true);
    setError(undefined);

    const parsed = CreateTenantBody.safeParse({ tenantName, outletName, timezone });
    if (!parsed.success) {
      setLoading(false);
      setError(parsed.error.issues[0]?.message ?? "Data belum lengkap.");
      return;
    }

    try {
      const result = await apiFetch<CreateTenantResponse>("/v1/tenants", {
        method: "POST",
        body: parsed.data,
        skipTenant: true,
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveTenantId(result.tenantId);
      router.push("/beranda");
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : "Gagal membuat toko.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Buat toko kamu</CardTitle>
          <CardDescription>Beberapa detik saja — bisa diubah lagi nanti di Pengaturan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tenantName">Nama toko / usaha</Label>
            <Input
              id="tenantName"
              placeholder="Warung Bu Sari"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outletName">Nama outlet pertama</Label>
            <Input
              id="outletName"
              placeholder="Cabang Utama"
              value={outletName}
              onChange={(e) => setOutletName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Zona waktu</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value as TenantTimezone)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button disabled={loading || !tenantName || !outletName} onClick={handleSubmit}>
            {loading ? "Membuat toko..." : "Buat toko"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
