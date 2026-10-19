import { ChevronRight, History, Store, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { canResetDemo, RESET_DEMO_PARAM } from "@/core/demo-reset";
import { deletionStage } from "@/core/shop-deletion";
import { getStoreProfile, listFaqs } from "@/db/kb";
import { getNotificationPrefs } from "@/db/notifications";
import { getShop, getShopDeletion } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { vapidConfigFromEnv } from "@/lib/web-push";
import { DataPrivacy } from "./data-privacy";
import { FaqManager } from "./faq-manager";
import { NotificationSettings } from "./notification-settings";
import { ResetDemo } from "./reset-demo";
import { StoreProfileForm } from "./store-profile-form";
import { PageGate } from "@/components/shell/page-gate";

export const metadata = { title: "Pengaturan" };

const SETTINGS_LINKS = [
  { page: "pengaturan/kanal", title: "Kanal & komisi", hint: "Shopee, TikTok, GoFood…: komisi per pesanan", icon: Store },
  { page: "pengaturan/anggota", title: "Anggota tim", hint: "Undang kasir atau admin chat, ubah peran, cabut akses", icon: Users },
  { page: "pengaturan/aktivitas", title: "Riwayat aktivitas", hint: "Siapa membatalkan transaksi, ubah harga, atau sesuaikan stok", icon: History },
] as const;

export default function PengaturanPage({ params, searchParams }: PageProps<"/[slug]/pengaturan">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Dibaca asisten saat menjawab pembeli</p>
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan toko</h1>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <PageGate params={params} permission="settings">
          <Content params={params} searchParams={searchParams} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/[slug]/pengaturan">, "params" | "searchParams">) {
  const { slug } = await params;
  const query = await searchParams;
  const shop = await getShop(slug);
  const [profile, faqs, deletion, prefs] = await Promise.all([
    getStoreProfile(shop.id),
    listFaqs(shop.id),
    getShopDeletion(shop.id),
    getNotificationPrefs(shop.id),
  ]);
  return (
    <>
      <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">Tautan chat pembeli</h2>
        <p className="text-sm text-muted-foreground">
          Bagikan tautan ini di bio Instagram atau WhatsApp: <span className="break-all font-mono text-foreground">/w/{slug}</span>
        </p>
      </section>
      <nav aria-label="Pengaturan lain" className="grid gap-3 sm:grid-cols-2">
        {SETTINGS_LINKS.map((l) => (
          <Link
            key={l.page}
            href={shopPath(slug, l.page)}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <l.icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{l.title}</span>
              <span className="text-sm text-muted-foreground">{l.hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </nav>
      <StoreProfileForm slug={slug} policies={profile.policies} persona={profile.persona} />
      <FaqManager slug={slug} faqs={faqs} />
      {prefs && (
        <NotificationSettings
          slug={slug}
          onEscalation={prefs.on_escalation}
          pushEnabled={prefs.push_enabled}
          pushKey={vapidConfigFromEnv()?.publicKey ?? null}
        />
      )}
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
