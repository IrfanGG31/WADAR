"use server";

import { redirect } from "next/navigation";
import {
  accountDeletionError,
  blockedMessage,
  confirmsAccountDeletion,
  parseAccountDeletion,
  type BlockedShop,
} from "@/core/account-deletion";
import { createClient } from "@/lib/supabase/server";

export interface DeleteAccountResult {
  error?: string;
  blockedShops?: BlockedShop[];
}

/**
 * Hapus akun (GAP #6): the signed-in user's memberships and devices go, demo shops only
 * they own go, then they are signed out. Refused while they are the last owner of a shop.
 * `auth.users` is not deleted here (needs the service-role Auth admin API; queued in SQL).
 */
export async function deleteMyAccount(typed: string): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return { error: accountDeletionError({ code: "28000" }) };
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!confirmsAccountDeletion(email, typed)) return { error: accountDeletionError({ code: "22023" }) };

  const { data, error } = await supabase.rpc("delete_my_account", { p_confirm: typed.trim() });
  if (error) return { error: accountDeletionError(error) };
  const result = parseAccountDeletion(data);
  if (!result.deleted) {
    return result.blockedShops.length > 0
      ? { error: blockedMessage(result.blockedShops), blockedShops: result.blockedShops }
      : { error: accountDeletionError({ code: "unknown" }) };
  }
  await supabase.auth.signOut();
  redirect("/");
}
