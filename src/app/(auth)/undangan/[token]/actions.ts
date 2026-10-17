"use server";

import { redirect } from "next/navigation";
import { isInviteToken, teamError } from "@/core/team";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/** TEAM-1: the signed-in invitee joins the shop (SQL checks the invited email), then lands on Beranda. */
export async function acceptInvite(token: string): Promise<{ error: string }> {
  if (!isInviteToken(token)) return { error: teamError({ code: "P0002" }) };
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_shop_invite", { p_token: token });
  if (error || typeof slug !== "string") return { error: teamError(error) };
  redirect(shopPath(slug, "beranda"));
}
