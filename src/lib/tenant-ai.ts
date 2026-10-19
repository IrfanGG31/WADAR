import "server-only";
import { aiFor, consultFor, type Ai, type Consult } from "@/ai";
import { loadCustomAi } from "@/db/ai-provider";

/** The AI a shop runs on: its own model when configured (Pusat Koneksi › Otak AI), else the default. */
export async function getTenantAi(tenantId: string): Promise<Ai> {
  return aiFor(await loadCustomAi(tenantId));
}

export async function getTenantConsult(tenantId: string): Promise<Consult> {
  return consultFor(await loadCustomAi(tenantId));
}
