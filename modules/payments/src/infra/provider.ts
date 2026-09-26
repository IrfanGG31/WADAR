export interface CreatedQris {
  providerRef: string;
  qrString: string;
}

export interface ProviderPayment {
  providerEventId: string;
  referenceId: string;
  amount: number;
  source: string;
  paidAt: Date;
}

/** ARCHITECTURE §8: 8 s timeout, retried by the caller at most once with the same reference id. */
export interface PaymentProvider {
  readonly name: "xendit" | "simulator";
  createQris(input: { referenceId: string; amount: number; expiresAt: Date }): Promise<CreatedQris>;
  /** Payments already made for a QR — used by the reconciliation job when a webhook was missed. */
  listQrPayments(providerRef: string): Promise<ProviderPayment[]>;
}

/**
 * Local/dev provider: generates a QRIS-looking payload and never talks to a
 * network. Payments are simulated through the same webhook-processing path
 * via POST /v1/payments/intents/:id/simulate-paid.
 */
export class SimulatorProvider implements PaymentProvider {
  readonly name = "simulator" as const;

  async createQris(input: { referenceId: string; amount: number }): Promise<CreatedQris> {
    return {
      providerRef: `sim_${input.referenceId}`,
      qrString: `00020101021226SIMULATOR5303360540${input.amount}5802ID6304SIMU|${input.referenceId}`,
    };
  }

  async listQrPayments(): Promise<ProviderPayment[]> {
    return [];
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Xendit QR Codes API (api-version 2022-07-31), test mode keys in dev.
 * NOTE (ARCHITECTURE §6.1): receiving money on behalf of a merchant needs
 * xenPlatform sub-accounts so funds settle to the merchant, not to WADAR —
 * see modules/payments/README.md.
 */
export class XenditProvider implements PaymentProvider {
  readonly name = "xendit" as const;
  private readonly auth: string;

  constructor(secretKey: string, private readonly baseUrl = "https://api.xendit.co") {
    this.auth = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
  }

  async createQris(input: { referenceId: string; amount: number; expiresAt: Date }): Promise<CreatedQris> {
    return withTimeout(8_000, async (signal) => {
      const res = await fetch(`${this.baseUrl}/qr_codes`, {
        method: "POST",
        signal,
        headers: { authorization: this.auth, "api-version": "2022-07-31", "content-type": "application/json" },
        body: JSON.stringify({
          reference_id: input.referenceId,
          type: "DYNAMIC",
          currency: "IDR",
          amount: input.amount,
          expires_at: input.expiresAt.toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`xendit create QR failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { id: string; qr_string: string };
      return { providerRef: json.id, qrString: json.qr_string };
    });
  }

  async listQrPayments(providerRef: string): Promise<ProviderPayment[]> {
    return withTimeout(8_000, async (signal) => {
      const res = await fetch(`${this.baseUrl}/qr_codes/${encodeURIComponent(providerRef)}/payments`, {
        signal,
        headers: { authorization: this.auth, "api-version": "2022-07-31" },
      });
      if (!res.ok) throw new Error(`xendit list QR payments failed: ${res.status}`);
      const json = (await res.json()) as { data: Array<XenditQrPayment> };
      return json.data.filter((p) => p.status === "SUCCEEDED").map(toProviderPayment);
    });
  }
}

export interface XenditQrPayment {
  id: string;
  qr_id?: string;
  reference_id: string;
  amount: number;
  status: string;
  created?: string;
  payment_detail?: { source?: string | null } | null;
}

export function toProviderPayment(p: XenditQrPayment): ProviderPayment {
  return {
    providerEventId: p.id,
    referenceId: p.reference_id,
    amount: Math.round(p.amount),
    source: p.payment_detail?.source ?? "QRIS",
    paidAt: p.created ? new Date(p.created) : new Date(),
  };
}

/** `<tenantId>_<intentId>` — the webhook arrives without auth context, so the reference carries the tenant. */
export function buildReferenceId(tenantId: string, intentId: string): string {
  return `${tenantId}_${intentId}`;
}

export function parseReferenceId(referenceId: string): { tenantId: string; intentId: string } | null {
  const match = /^([0-9a-f-]{36})_([0-9a-f-]{36})$/i.exec(referenceId);
  return match ? { tenantId: match[1]!, intentId: match[2]! } : null;
}
