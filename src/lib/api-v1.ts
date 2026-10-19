import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiScope } from "@/core/channels/api-key";
import { authenticateApiKey, type ApiCaller } from "@/db/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";

/** Problem JSON for the public API (RFC 7807 shape, Indonesian `detail`). */
export function apiError(status: number, code: string, detail: string, extra: Record<string, unknown> = {}) {
  return Response.json({ type: "about:blank", status, code, detail, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Authenticates the WADAR API key, checks the scope, then runs `handler` for that one shop. */
export async function withApiKey(
  request: Request,
  scope: ApiScope,
  handler: (ctx: { caller: ApiCaller; db: SupabaseClient }) => Promise<Response>,
): Promise<Response> {
  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return apiError(503, "not_configured", "API WADAR belum aktif di server ini.");
  }
  const caller = await authenticateApiKey(db, request.headers.get("authorization"));
  if (!caller) return apiError(401, "invalid_key", "API key tidak valid atau sudah dicabut. Kirim header Authorization: Bearer wdr_…");
  if (!caller.scopes.includes(scope)) return apiError(403, "missing_scope", `Kunci ini tidak punya izin "${scope}".`);
  try {
    return await handler({ caller, db });
  } catch (e) {
    console.error("api v1 failed", scope, e instanceof Error ? e.message : e);
    return apiError(500, "internal", "Ada gangguan di WADAR. Coba lagi sebentar.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
