import { createClient } from "./supabase/client";
import { getActiveTenantIdClient } from "./tenant-cookie";
import { getWebEnv } from "./env";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  correlationId?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Overrides the active-tenant cookie — only onboarding needs this (no tenant exists yet, so omit tenant header entirely instead). */
  skipTenant?: boolean;
  idempotencyKey?: string;
}

/**
 * Browser-only fetch wrapper for apps/api's `/v1/*` routes — reads the
 * current Supabase session for the `Authorization` header and the active
 * tenant cookie for `x-tenant-id` (see lib/tenant-cookie.ts), so callers
 * never have to thread either through by hand.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const env = getWebEnv();
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-correlation-id": crypto.randomUUID(),
  };
  if (session?.access_token) {
    headers.authorization = `Bearer ${session.access_token}`;
  }
  if (!options.skipTenant) {
    const tenantId = getActiveTenantIdClient();
    if (tenantId) headers["x-tenant-id"] = tenantId;
  }
  if (options.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
