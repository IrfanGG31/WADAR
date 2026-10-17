import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Returns the error response to send,
 * or null when the request may run: 503 without the env var (the job never runs), 401 otherwise.
 */
export function rejectCronRequest(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET belum diatur." }, { status: 503 });
  const given = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  return null;
}
