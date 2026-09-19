"use client";

import { Button } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../lib/api-client";
import { setActiveTenantId } from "../../../lib/tenant-cookie";

interface AcceptInvitationResponse {
  tenantId: string;
}

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleAccept() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await apiFetch<AcceptInvitationResponse>(`/v1/invitations/${token}/accept`, {
        method: "POST",
        skipTenant: true,
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveTenantId(result.tenantId);
      router.push("/beranda");
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : "Gagal menerima undangan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={loading} onClick={handleAccept}>
        {loading ? "Memproses..." : "Terima undangan"}
      </Button>
    </div>
  );
}
