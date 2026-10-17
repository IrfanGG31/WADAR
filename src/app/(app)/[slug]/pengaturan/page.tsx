import { Suspense } from "react";
import { canResetDemo, RESET_DEMO_PARAM } from "@/core/demo-reset";
import { deletionStage } from "@/core/shop-deletion";
import { getStoreProfile, listFaqs } from "@/db/kb";
import { getShop, getShopDeletion } from "@/db/shop";
import { DataPrivacy } from "./data-privacy";
import { FaqManager } from "./faq-manager";
import { ResetDemo } from "./reset-demo";
import { StoreProfileForm } from "./store-profile-form";

export const metadata = { title: "Pengaturan" };

export default function PengaturanPage({ params, searchParams }: PageProps<"/[slug]/pengaturan">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Dibaca asisten saat menjawab pembeli</p>
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan toko</h1>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/[slug]/pengaturan">, "params" | "searchParams">) {
  const { slug } = await params;
  const query = await searchParams;
  const shop = await getShop(slug);
  const [profile, faqs, deletion] = await Promise.all([getStoreProfile(shop.id), listFaqs(shop.id), getShopDeletion(shop.id)]);
  return (
    <>
      <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Tautan chat pembeli</h2>
        <p className="text-sm text-muted-foreground">
          Bagikan tautan ini di bio Instagram atau WhatsApp: <span className="break-all font-mono text-foreground">/w/{slug}</span>
        </p>
      </section>
      <StoreProfileForm slug={slug} policies={profile.policies} persona={profile.persona} />
      <FaqManager slug={slug} faqs={faqs} />
      <DataPrivacy slug={slug} deletion={deletionStage(deletion)} />
      {canResetDemo(shop, query[RESET_DEMO_PARAM]) && <ResetDemo slug={slug} />}
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat pengaturan" className="flex flex-col gap-4">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
