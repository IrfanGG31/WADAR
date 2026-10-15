import { Suspense } from "react";
import { getStoreProfile, listFaqs } from "@/db/kb";
import { getShop } from "@/db/shop";
import { FaqManager } from "./faq-manager";
import { StoreProfileForm } from "./store-profile-form";

export const metadata = { title: "Pengaturan" };

export default function PengaturanPage({ params }: PageProps<"/[slug]/pengaturan">) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Dibaca asisten saat menjawab pembeli</p>
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan toko</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat pengaturan…</p>}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<PageProps<"/[slug]/pengaturan">, "params">) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [profile, faqs] = await Promise.all([getStoreProfile(shop.id), listFaqs(shop.id)]);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Tautan chat pembeli</h2>
        <p className="text-sm text-muted-foreground">
          Bagikan tautan ini di bio Instagram atau WhatsApp: <span className="font-mono">/w/{slug}</span>
        </p>
      </section>
      <StoreProfileForm slug={slug} policies={profile.policies} persona={profile.persona} />
      <FaqManager slug={slug} faqs={faqs} />
    </>
  );
}
