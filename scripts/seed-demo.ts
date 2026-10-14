/**
 * Seeds the two fixed demo shops (glow-by-sari, kopi-dimas) with 90 days of data
 * for one owner account, via public.seed_demo_for_owner (service role only).
 *
 *   pnpm seed:demo --reset [--owner email@contoh.id]
 *
 * --reset archives the current demo shops (renamed, kept) and builds fresh ones.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local);
 * the owner defaults to DEMO_OWNER_EMAIL.
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const ownerFlag = args.indexOf("--owner");
const ownerEmail = (ownerFlag >= 0 ? args[ownerFlag + 1] : process.env.DEMO_OWNER_EMAIL)?.trim().toLowerCase();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local dulu.");
  process.exit(1);
}
if (!ownerEmail) {
  console.error("Sebutkan pemilik toko demo: --owner email@contoh.id (atau DEMO_OWNER_EMAIL).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findOrCreateOwner(email: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  console.log(`Akun ${email} dibuat (masuk lewat kode email atau atur kata sandi dari /masuk/admin).`);
  return data.user.id;
}

const started = Date.now();
const ownerId = await findOrCreateOwner(ownerEmail);
const { data, error } = await admin.rpc("seed_demo_for_owner", { p_owner: ownerId, p_reset: reset });
if (error) {
  console.error(`Seed gagal: ${error.message}`);
  process.exit(1);
}
const slugs = (data as string[]).join(", ");
console.log(`${reset ? "Toko demo dibuat ulang" : "Toko demo siap"}: ${slugs} (pemilik ${ownerEmail}, ${Date.now() - started} ms).`);
