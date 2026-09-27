"use client";

import { InviteMemberBody, SystemRoleKey, type SystemRoleKey as SystemRoleKeyType } from "@wadar/contracts/identity";
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../../lib/api-client";
import { UserPlus, Copy, CheckCircle2 } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(undefined);
    setInviteLink(undefined);
    setCopied(false);

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

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="shadow-sm border-primary/20 sticky top-24">
      <CardHeader className="pb-4 border-b border-border/50 bg-primary/5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" /> Undang Anggota
        </CardTitle>
        <CardDescription className="text-xs">
          Tambahkan staf ke toko Anda dengan peran akses khusus.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-4 mt-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Kontak</Label>
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "email" | "phone")}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs focus-visible:ring-1 focus-visible:ring-primary w-24 shrink-0 outline-none"
            >
              <option value="email">Email</option>
              <option value="phone">No. HP</option>
            </select>
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={channel === "email" ? "nama@usaha.com" : "08123456789"}
              className="flex-1 h-9 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inviteRole" className="text-xs font-semibold">Peran Akses</Label>
          <select
            id="inviteRole"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value as SystemRoleKeyType)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs focus-visible:ring-1 focus-visible:ring-primary outline-none"
          >
            {SystemRoleKey.options
              .filter((key) => key !== "owner")
              .map((key) => (
                <option key={key} value={key}>
                  {ROLE_LABEL[key]}
                </option>
              ))}
          </select>
        </div>

        {error && <p className="text-[10px] text-destructive bg-destructive/10 p-2 rounded">{error}</p>}

        <Button size="sm" disabled={loading || !identifier} onClick={handleSubmit} className="w-full text-xs h-9">
          {loading ? "Memproses..." : "Kirim Undangan"}
        </Button>

        {inviteLink && (
          <div className="mt-2 flex flex-col gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
            <p className="text-[10px] text-emerald-800 font-medium">✅ Undangan dibuat! Salin tautan ini untuk dikirim ke staf:</p>
            <div className="flex gap-2">
              <Input readOnly value={inviteLink} className="flex-1 text-[10px] h-7 px-2" onFocus={(e) => e.target.select()} />
              <Button
                type="button"
                size="icon"
                variant={copied ? "default" : "outline"}
                className={`h-7 w-7 shrink-0 ${copied ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                onClick={handleCopy}
              >
                {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
