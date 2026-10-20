import { ApiOrdersInput, resolveApiOrders } from "@/core/channels/api-orders";
import { apiError, readJson, withApiKey } from "@/lib/api-v1";
import { scheduleWebhookDispatch } from "@/lib/webhook-dispatch";

export const maxDuration = 60;

/**
 * POST /api/v1/orders — book orders from an outside app. Runs `api_import_orders`, which acts as the
 * key's owner: same dedupe, stock, commission and audit rules as Transaksi › Marketplace.
 */
export function POST(request: Request) {
  return withApiKey(request, "orders:write", async ({ caller, db }) => {
    const parsed = ApiOrdersInput.safeParse(await readJson(request));
    if (!parsed.success) {
      return apiError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Isi permintaan tidak valid.", {
        issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { data: channel } = await db
      .from("channels")
      .select("id, kind")
      .eq("tenant_id", caller.tenantId)
      .eq("kind", parsed.data.channel)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle<{ id: string; kind: string }>();
    if (!channel) return apiError(422, "unknown_channel", `Kanal "${parsed.data.channel}" belum ada di toko. Tambahkan di Pengaturan › Kanal & komisi.`);

    const { data: variants, error: ve } = await db.from("variants").select("id, sku").eq("tenant_id", caller.tenantId).limit(5000);
    if (ve) throw ve;
    const { ready, errors } = resolveApiOrders(parsed.data, variants ?? []);
    let result = { created: 0, duplicate: 0, canceled: 0, failed: 0, errors: [] as { order: string; error: string }[] };
    if (ready.length) {
      const marketplace = ["shopee", "tiktok_shop", "tokopedia"].includes(channel.kind) ? channel.kind : "other";
      const { data, error } = await db.rpc("api_import_orders", {
        p_key_id: caller.keyId,
        p_channel_id: channel.id,
        p_marketplace: marketplace,
        p_source: parsed.data.source ?? "api",
        p_orders: ready,
      });
      if (error) {
        if (error.code === "42501") return apiError(403, "forbidden", "Kunci ini sudah tidak berlaku (dicabut, atau pembuatnya bukan pemilik toko lagi).");
        throw error;
      }
      result = data as typeof result;
    }
    if (result.created > 0) scheduleWebhookDispatch(caller.tenantId);
    return Response.json({ ...result, failed: result.failed + errors.length, errors: [...errors, ...(result.errors ?? [])] });
  });
}
