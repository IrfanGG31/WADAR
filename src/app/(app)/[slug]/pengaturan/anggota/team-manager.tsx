"use client";

import { Check, Copy, Loader2, UserMinus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, type MemberRole } from "@/core/roles";
import { INVITABLE_ROLES, invitePath, ROLE_HINT, type InvitableRole } from "@/core/team";
import type { OpenInvite, TeamMember } from "@/db/team";
import { formatDateTime } from "@/lib/format-date";
import { changeMemberRole, inviteMember, removeMember, revokeInvite } from "./actions";

const selectClass =
  "h-11 rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 md:text-sm";

type Message = { error?: string; note?: string };

export function TeamManager({ slug, members, invites }: { slug: string; members: TeamMember[]; invites: OpenInvite[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("cashier");
  const [link, setLink] = useState<{ path: string; email: string }>();
  const [message, setMessage] = useState<Message>();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<Message>) => {
    setMessage(undefined);
    startTransition(async () => {
      setMessage(await action());
      router.refresh();
    });
  };

  const invite = () =>
    run(async () => {
      const result = await inviteMember(slug, { email, role });
      if ("error" in result) return result;
      setLink({ path: result.path, email: result.email });
      setEmail("");
      return { note: `Undangan untuk ${result.email} siap. Salin tautannya dan kirim lewat WhatsApp.` };
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Undang anggota</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Peran</Label>
            <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)} className={selectClass}>
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {capitalize(ROLE_LABEL[r])}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">{ROLE_HINT[role]}</p>
          </div>
          <Button type="submit" disabled={pending || !email.trim()} className="self-start">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Buat tautan undangan
          </Button>
        </form>
        {link && <CopyLink path={link.path} label={`Tautan untuk ${link.email}`} />}
        <p className="text-xs text-muted-foreground">
          Email tidak dikirim otomatis. Tautan berlaku 7 hari dan hanya bisa dipakai oleh email yang diundang.
        </p>
      </section>

      {message?.error && (
        <p role="alert" className="text-sm text-destructive">
          {message.error}
        </p>
      )}
      {message?.note && <p className="text-sm text-muted-foreground">{message.note}</p>}

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Anggota ({members.length})</h2>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{m.email ?? "(tanpa email)"}</span>
                {m.is_me && <span className="text-xs text-muted-foreground">Kamu</span>}
              </div>
              {m.is_me ? (
                <Badge>{capitalize(ROLE_LABEL[m.role])}</Badge>
              ) : (
                <>
                  <select
                    aria-label={`Peran ${m.email ?? "anggota"}`}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => run(() => changeMemberRole(slug, { userId: m.user_id, role: e.target.value as MemberRole }))}
                    className={selectClass}
                  >
                    {(["owner", ...INVITABLE_ROLES] as MemberRole[]).map((r) => (
                      <option key={r} value={r}>
                        {capitalize(ROLE_LABEL[r])}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Cabut akses ${m.email ?? "anggota ini"}? Mereka tidak bisa membuka toko lagi.`)) run(() => removeMember(slug, m.user_id));
                    }}
                  >
                    <UserMinus className="h-4 w-4" />
                    Cabut akses
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <h2 className="text-lg font-semibold">Undangan menunggu ({invites.length})</h2>
          <ul className="divide-y divide-border">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{inv.email}</span>
                  <Badge>{capitalize(ROLE_LABEL[inv.role])}</Badge>
                  <Button type="button" variant="ghost" size="sm" className="h-11" disabled={pending} onClick={() => run(() => revokeInvite(slug, inv.id))}>
                    <X className="h-4 w-4" />
                    Batalkan
                  </Button>
                </div>
                <CopyLink path={invitePath(inv.token)} label={`Berlaku sampai ${formatDateTime(inv.expires_at, "Asia/Jakarta")}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const noSubscribe = () => () => {};

/** Full link on the client; the server render shows the path (no hydration mismatch). */
function CopyLink({ path, label }: { path: string; label: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label={label} />
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
