"use client";

import { InviteMemberBody, SystemRoleKey, type SystemRoleKey as SystemRoleKeyType } from "@wadar/contracts/identity";
import { Button, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../../lib/api-client";

const ROLE_LABEL: Record<SystemRoleKeyType, string> = {
  owner: "Pemilik",
  manager: "Manajer",
  cashier: "Kasir",
  chat_admin: "Admin Chat",
  warehouse: "Gudang",
};

interface InviteMemberResponse {
  invitationId: string;
  token: string;
  expiresAt: string;
}

export function InviteMemberForm() {
  const router = useRouter();
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [roleKey, setRoleKey] = useState<SystemRoleKeyType>("cashier");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [inviteLink, setInviteLink] = useState<string | undefined>();

  async function handleSubmit() {
    setLoading(true);
    setError(undefined);
    setInviteLink(undefined);

    const parsed = InviteMemberBody.safeParse({
      email: channel === "email" ? identifier : undefined,
      phone: channel === "phone" ? identifier : undefined,
      roleKey,
    });
    if (!parsed.success) {
      setLoading(false);
      setError(parsed.error.issues[0]?.message ?? "Data belum lengkap.");
      return;
    }

    try {
      // No email/WA delivery yet (M8+) — the link is shown here so the
      // owner can copy and send it manually themselves in the meantime.
      const result = await apiFetch<InviteMemberResponse>("/v1/invitations", {
        method: "POST",
        body: parsed.data,
        idempotencyKey: crypto.randomUUID(),
      });
      setIdentifier("");
      setInviteLink(`${window.location.origin}/undangan/${result.token}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : "Gagal mengundang anggota.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Undang anggota baru</p>
      <div className="flex gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as "email" | "phone")}
          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="email">Email</option>
          <option value="phone">No. HP</option>
        </select>
        <Input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={channel === "email" ? "nama@usaha.com" : "08123456789"}
          className="flex-1"
        />
      </div>
      <Label htmlFor="inviteRole">Peran</Label>
      <select
        id="inviteRole"
        value={roleKey}
        onChange={(e) => setRoleKey(e.target.value as SystemRoleKeyType)}
        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
      >
        {SystemRoleKey.options
          .filter((key) => key !== "owner")
          .map((key) => (
            <option key={key} value={key}>
              {ROLE_LABEL[key]}
            </option>
          ))}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {inviteLink && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-primary">Undangan dibuat — salin tautan ini untuk dikirim:</p>
          <div className="flex gap-2">
            <Input readOnly value={inviteLink} className="flex-1 text-xs" onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(inviteLink)}
            >
              Salin
            </Button>
          </div>
        </div>
      )}
      <Button size="sm" disabled={loading || !identifier} onClick={handleSubmit} className="self-start">
        {loading ? "Mengundang..." : "Kirim undangan"}
      </Button>
    </div>
  );
}
