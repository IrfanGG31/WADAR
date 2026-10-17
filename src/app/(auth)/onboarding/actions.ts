"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { slugProblem } from "@/core/slug";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

const CreateShopInput = z.object({
  name: z.string().trim().min(2, "Nama toko minimal 2 huruf.").max(80),
  slug: z
    .string()
    .trim()
    .superRefine((slug, ctx) => {
      const problem = slugProblem(slug);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  businessType: z.enum(["fesyen", "fnb", "kecantikan", "lainnya"]),
});

export interface CreateShopState {
  error?: string;
}

export async function createShop(_prev: CreateShopState, formData: FormData): Promise<CreateShopState> {
  const parsed = CreateShopInput.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    businessType: formData.get("businessType"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_shop", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_business_type: parsed.data.businessType,
  });
  if (error) {
    if (error.code === "23505") return { error: "Alamat toko itu sudah dipakai. Coba yang lain." };
    return { error: "Toko belum bisa dibuat. Coba lagi sebentar." };
  }
  redirect(shopPath(parsed.data.slug, "beranda"));
}
