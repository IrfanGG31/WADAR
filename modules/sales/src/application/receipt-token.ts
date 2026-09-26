import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Public receipt links (PRD O2.3 "struk digital via link"): an unguessable,
 * tamper-proof token binding tenant + order, so the receipt page needs no
 * login yet can't be used to enumerate other orders. Both UUIDs are packed
 * as raw bytes to stay under Fastify's 100-char route-param limit.
 */
const SIGNATURE_CHARS = 22; // 132 bits of HMAC-SHA256

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url").slice(0, SIGNATURE_CHARS);
}

export function signReceiptToken(secret: string, tenantId: string, orderId: string): string {
  const body = Buffer.concat([uuidToBytes(tenantId), uuidToBytes(orderId)]).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

export function verifyReceiptToken(secret: string, token: string): { tenantId: string; orderId: string } | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || signature.length !== SIGNATURE_CHARS) return null;
  const expected = Buffer.from(sign(secret, body));
  if (!timingSafeEqual(Buffer.from(signature), expected)) return null;
  const bytes = Buffer.from(body, "base64url");
  if (bytes.length !== 32) return null;
  return { tenantId: bytesToUuid(bytes.subarray(0, 16)), orderId: bytesToUuid(bytes.subarray(16)) };
}
