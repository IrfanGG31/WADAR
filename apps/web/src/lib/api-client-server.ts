import { ApiError, type ProblemDetails } from "./api-client";
import { getWebEnv } from "./env";
import { createClient } from "./supabase/server";
import { getActiveTenantIdServer } from "./tenant-cookie-server";

export { ApiError, type ProblemDetails };

interface ApiFetchServerOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  skipTenant?: boolean;
}

/** Server Component / Route Handler counterpart of lib/api-client.ts's apiFetch. */
export async function apiFetchServer<T>(path: string, options: ApiFetchServerOptions = {}): Promise<T> {
  const env = getWebEnv();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (session?.access_token) {
    headers.authorization = `Bearer ${session.access_token}`;
  }
  if (!options.skipTenant) {
    const tenantId = await getActiveTenantIdServer();
    if (tenantId) headers["x-tenant-id"] = tenantId;
  }

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => undefined)) as unknown;
  if (!res.ok) {
    throw new ApiError(
      (json as ProblemDetails | undefined) ?? {
        type: "about:blank",
        title: "Terjadi kesalahan",
        status: res.status,
        code: "UNKNOWN_ERROR",
      },
    );
  }
  return json as T;
}
