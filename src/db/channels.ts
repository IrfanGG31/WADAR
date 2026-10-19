import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ChannelRow {
  id: string;
  kind: string;
  name: string;
  fee_pct: number;
  fee_fixed: number;
}

/** Active sales channels, cashier (pos) first. */
export async function listChannels(tenantId: string): Promise<ChannelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("id, kind, name, fee_pct, fee_fixed")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as ChannelRow[])
    .map((c) => ({ ...c, fee_pct: Number(c.fee_pct), fee_fixed: Number(c.fee_fixed) }))
    .sort((a, b) => Number(b.kind === "pos") - Number(a.kind === "pos"));
}

export interface ChannelSettingsRow extends ChannelRow {
  is_active: boolean;
  fee_is_default: boolean;
}

/** Every channel of the shop, inactive ones too (Pengaturan › Kanal & komisi). */
export async function listAllChannels(tenantId: string): Promise<ChannelSettingsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("id, kind, name, fee_pct, fee_fixed, is_active, fee_is_default")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as ChannelSettingsRow[])
    .map((c) => ({ ...c, fee_pct: Number(c.fee_pct), fee_fixed: Number(c.fee_fixed) }))
    .sort((a, b) => Number(b.kind === "pos") - Number(a.kind === "pos") || Number(b.is_active) - Number(a.is_active));
}
