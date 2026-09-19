"use client";

import { CreateOutletBody } from "@wadar/contracts/identity";
import { Button, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../../lib/api-client";

export function AddOutletForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit() {
    setLoading(true);
    setError(undefined);

    const parsed = CreateOutletBody.safeParse({ name, address: address || undefined });
    if (!parsed.success) {
      setLoading(false);
      setError(parsed.error.issues[0]?.message ?? "Data belum lengkap.");
      return;
    }

    try {
      await apiFetch("/v1/outlets", {
        method: "POST",
        body: parsed.data,
        idempotencyKey: crypto.randomUUID(),
      });
      setName("");
      setAddress("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : "Gagal menambah outlet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <Label htmlFor="outletName">Nama outlet baru</Label>
      <Input id="outletName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cabang 2" />
      <Label htmlFor="outletAddress">Alamat (opsional)</Label>
      <Input id="outletAddress" value={address} onChange={(e) => setAddress(e.target.value)} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="sm" disabled={loading || !name} onClick={handleSubmit} className="self-start">
        {loading ? "Menambah..." : "Tambah outlet"}
      </Button>
    </div>
  );
}
