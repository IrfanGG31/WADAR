"use server";

import { InviteInput, invitePath, RoleChangeInput, teamError } from "@/core/team";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../actions";

/**
 * Anggota tim (TEAM-1): owner only — the SQL functions check the role again. No email is sent;
 * the client refreshes the list after each action.
 */

export type InviteResult = { path: string; email: string } | { error: string };

export async function inviteMember(slug: string, input: unknown): Promise<InviteResult> {
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "team");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_shop_invite", { p_tenant_id: shop.id, p_email: parsed.data.email, p_role: parsed.data.role })
    .single<{ token: string; email: string }>();
  if (error || !data) return { error: teamError(error) };
  return { path: invitePath(data.token), email: data.email };
}

export async function revokeInvite(slug: string, inviteId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "team");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_shop_invite", { p_tenant_id: shop.id, p_invite_id: inviteId });
  if (error) return { error: teamError(error) };
  return { note: "Undangan dibatalkan. Tautannya tidak bisa dipakai lagi." };
}

export async function changeMemberRole(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = RoleChangeInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "team");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_tenant_id: shop.id,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return { error: teamError(error) };
  return { note: "Peran diperbarui." };
}

export async function removeMember(slug: string, userId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "team");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_shop_member", { p_tenant_id: shop.id, p_user_id: userId });
  if (error) return { error: teamError(error) };
  return { note: "Akses dicabut. Anggota ini tidak bisa membuka toko lagi." };
}
