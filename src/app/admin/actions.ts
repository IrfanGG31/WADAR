"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_PROFILES } from "@/core/demo-profiles";
import { isPlatformAdmin } from "@/db/admin";
import { createClient } from "@/lib/supabase/server";

export interface AdminResult {
  error?: string;
  note?: string;
}

const NOT_ADMIN = "Hanya admin WADAR yang bisa mengubah ini.";

const TemplateInput = z.object({
  profile: z.enum(DEMO_PROFILES),
  name: z.string().trim().min(2, "Nama toko minimal 2 huruf.").max(60, "Nama toko maksimal 60 huruf."),
  owner: z.string().trim().min(1, "Isi nama pemilik/asisten.").max(30),
  segment: z.string().trim().min(1, "Isi jenis usaha.").max(40),
  tagline: z.string().trim().max(160),
  emoji: z.string().trim().min(1).max(8),
  onJuri: z.boolean(),
});

export async function saveDemoTemplate(input: unknown): Promise<AdminResult> {
  const parsed = TemplateInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum benar." };
  if (!(await isPlatformAdmin())) return { error: NOT_ADMIN };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_demo_template", {
    p_profile: v.profile,
    p_name: v.name,
    p_owner: v.owner,
    p_segment: v.segment,
    p_tagline: v.tagline,
    p_emoji: v.emoji,
    p_on_juri: v.onJuri,
  });
  if (error) return { error: error.code === "42501" ? NOT_ADMIN : "Belum tersimpan. Coba lagi sebentar." };
  revalidatePath("/admin");
  revalidatePath("/juri");
  return { note: `Tersimpan. Toko demo ${v.name} yang baru dibuat memakai nama ini.` };
}

const RenameInput = z.object({
  tenantId: z.uuid(),
  name: z.string().trim().min(2, "Nama toko minimal 2 huruf.").max(60, "Nama toko maksimal 60 huruf."),
});

export async function renameShop(input: unknown): Promise<AdminResult> {
  const parsed = RenameInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum benar." };
  if (!(await isPlatformAdmin())) return { error: NOT_ADMIN };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_rename_shop", { p_tenant_id: parsed.data.tenantId, p_name: parsed.data.name });
  if (error) return { error: error.code === "42501" ? NOT_ADMIN : "Belum tersimpan. Coba lagi sebentar." };
  revalidatePath("/admin");
  return { note: `Nama toko diganti menjadi ${parsed.data.name}.` };
}

/** Signed in as someone else (e.g. a demo visitor): sign out and come back through the admin login. */
export async function switchToAdmin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/masuk/admin?next=/admin");
}
