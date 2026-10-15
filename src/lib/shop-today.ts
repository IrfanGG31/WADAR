import "server-only";
import { connection } from "next/server";
import { isoDateInZone } from "@/core/period";

/**
 * The shop's local date ("YYYY-MM-DD") for this request. `connection()` first:
 * with cacheComponents the clock may only be read at request time, never
 * during a prerender.
 */
export async function shopToday(timeZone: string): Promise<string> {
  await connection();
  return isoDateInZone(new Date(), timeZone);
}
