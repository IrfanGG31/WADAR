import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parsePersona } from "@/core/chat/store-policies";
import { createAdminClient } from "@/lib/supabase/admin";
import { WidgetChat } from "./widget-chat";

export const metadata = { title: "Chat toko", robots: { index: false } };

/** Public customer chat. Reads only the shop's name and the assistant's name — nothing internal. */
async function Shop({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connection();
  const db = createAdminClient();
  const { data: tenant } = await db.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
  if (!tenant) notFound();
  const { data: profile } = await db.from("store_profile").select("persona").eq("tenant_id", tenant.id).maybeSingle();
  const persona = parsePersona(profile?.persona ?? {});
  return <WidgetChat slug={slug} shopName={tenant.name as string} assistantName={persona.name} salutation={persona.salutation} />;
}

export default function WidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col bg-background">
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Memuat chat…</p>}>
        <Shop params={params} />
      </Suspense>
    </main>
  );
}
