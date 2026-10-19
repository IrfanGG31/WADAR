import "server-only";
import { policyFacts, parsePolicies } from "@/core/chat/store-policies";
import type { SetupFacts } from "@/core/onboarding";
import { createClient } from "@/lib/supabase/server";

/** ONB-2: whether the owner hid the checklist, and the facts that tick its steps. Counts only (head requests). */
export async function getSetupState(tenantId: string): Promise<{ hiddenAt: string | null; facts: SetupFacts }> {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(q).then((r) => {
      if (r.error) throw r.error;
      return r.count ?? 0;
    });
  const [tenant, products, channels, profile, faqs, sales, expenses] = await Promise.all([
    supabase.from("tenants").select("onboarding_done_at").eq("id", tenantId).maybeSingle(),
    count(supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("deleted_at", null)),
    count(
      supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("fee_is_default", true)
        .or("fee_pct.gt.0,fee_fixed.gt.0"),
    ),
    supabase.from("store_profile").select("policies").eq("tenant_id", tenantId).maybeSingle(),
    count(supabase.from("kb_documents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "faq")),
    count(supabase.from("sales").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    count(supabase.from("expenses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
  ]);
  if (tenant.error) throw tenant.error;
  if (profile.error) throw profile.error;
  return {
    hiddenAt: (tenant.data?.onboarding_done_at as string | null) ?? null,
    facts: {
      products,
      channelsOnDefaultFee: channels,
      policyFacts: policyFacts(parsePolicies(profile.data?.policies)).length,
      faqs,
      sales,
      expenses,
    },
  };
}
