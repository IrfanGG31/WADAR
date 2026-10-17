import "server-only";
import type { MemberRole } from "@/core/roles";
import type { InvitableRole } from "@/core/team";
import { createClient } from "@/lib/supabase/server";

export interface TeamMember {
  user_id: string;
  email: string | null;
  role: MemberRole;
  created_at: string;
  is_me: boolean;
}

export interface OpenInvite {
  id: string;
  email: string;
  role: InvitableRole;
  token: string;
  created_at: string;
  expires_at: string;
}

/** Members (with emails, owner-only SQL function) and still-open invites of one shop. */
export async function getTeam(tenantId: string, now = new Date()): Promise<{ members: TeamMember[]; invites: OpenInvite[] }> {
  const supabase = await createClient();
  const [members, invites] = await Promise.all([
    supabase.rpc("list_shop_members", { p_tenant_id: tenantId }),
    supabase
      .from("shop_invites")
      .select("id, email, role, token, created_at, expires_at")
      .eq("tenant_id", tenantId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false }),
  ]);
  if (members.error) throw members.error;
  if (invites.error) throw invites.error;
  return { members: (members.data ?? []) as TeamMember[], invites: (invites.data ?? []) as OpenInvite[] };
}
