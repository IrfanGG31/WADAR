import { ArrowRight, Clock, FlaskConical, PenLine, QrCode } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PitchCard } from "@/components/demo/pitch-card";
import { PageGate } from "@/components/shell/page-gate";
import { DEMO_PROFILES, DEMO_SHOPS, dayStory, SEGMENT_PROFILES } from "@/core/demo-profiles";
import { IMPACT_ASSUMPTIONS, weeklyImpact } from "@/core/impact";
import { getStoreProfile } from "@/db/kb";
import { getDemoProfile, getWeeklyCounts, listMyDemoShops } from "@/db/ruang-demo";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { IdentityForm } from "./identity-form";
import { ImpactCounter } from "./impact-counter";
import { StartTourButton } from "./start-tour-button";
import { VariantPicker } from "./variant-picker";

export const metadata = { title: "Ruang Demo" };

type Params = PageProps<"/[slug]/staging">["params"];

/** Ruang Demo (staging): presentation tools for judges — impact, a day in the shop, the pitch, segment demos, QRIS simulation. */
export default function StagingPage({ params }: PageProps<"/[slug]/staging">) {
  return (
    <div className="page-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Staging
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Ruang Demo</h1>
        <p className="text-sm text-muted-foreground">Alat presentasi untuk juri dan calon pengguna. Tidak tampil di menu toko dan tidak mengubah data penjualan.</p>
      </div>
      <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Body params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [counts, profile, mine, store] = await Promise.all([getWeeklyCounts(shop.id), getDemoProfile(shop), listMyDemoShops(), getStoreProfile(shop.id)]);
  const impact = weeklyImpact({ sales: counts.sales, aiReplies: counts.aiReplies, days: 7 });
  const story = DEMO_SHOPS[profile ?? "warkop"];
  const owner = store.persona.name ?? "";
  const moments = dayStory(profile ?? "warkop", owner);
  const a = IMPACT_ASSUMPTIONS;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-border p-5" aria-labelledby="identitas">
        <div>
          <h2 id="identitas" className="flex items-center gap-2 text-lg font-semibold text-navy">
            <PenLine className="h-4 w-4 text-primary" aria-hidden /> Sesuaikan toko
          </h2>
          <p className="text-sm text-muted-foreground">Ganti nama usaha sesuai calon pengguna atau juri yang kamu ajak demo. Data penjualan tidak berubah.</p>
        </div>
        <IdentityForm
          current={{ name: shop.name, owner, address: store.policies.address ?? "" }}
          original={profile ? { name: DEMO_SHOPS[profile].name, owner: DEMO_SHOPS[profile].owner, address: "" } : null}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border p-5" aria-labelledby="dampak">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="dampak" className="text-lg font-semibold text-navy">
              Dampak 7 hari terakhir
            </h2>
            <p className="text-sm text-muted-foreground">Dihitung dari data {shop.name} yang sebenarnya, bukan angka pemasaran.</p>
          </div>
          <StartTourButton />
        </div>
        <ImpactCounter
          shopName={shop.name}
          totalMinutes={impact.minutesTotal}
          parts={[
            { label: "transaksi tercatat otomatis", count: counts.sales, minutes: impact.minutesFromSales, note: `${a.secondsPerSale} detik/nota & rekap` },
            { label: "chat dijawab asisten", count: counts.aiReplies, minutes: impact.minutesFromChat, note: `${a.secondsPerAiReply} detik/balasan` },
            { label: "laporan harian otomatis", count: 7, minutes: impact.minutesFromRecap, note: `${a.minutesPerDailyRecap} menit/hari tutup buku` },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border p-5" aria-labelledby="sehari">
        <div>
          <h2 id="sehari" className="text-lg font-semibold text-navy">
            Sehari di {shop.name}
          </h2>
          <p className="text-sm text-muted-foreground">{story.tagline} Klik satu momen untuk melihatnya langsung di aplikasi.</p>
        </div>
        <ol className="relative flex flex-col gap-1 border-l-2 border-primary/20 pl-5">
          {moments.map((m) => (
            <li key={m.time} className="relative">
              <span className="absolute -left-[27px] top-4 h-3 w-3 rounded-full bg-primary ring-4 ring-primary/15" aria-hidden />
              <Link href={shopPath(slug, m.page)} className="group flex flex-col gap-0.5 rounded-xl p-3 hover:bg-surface sm:flex-row sm:items-start sm:gap-4">
                <span className="flex w-16 shrink-0 items-center gap-1 font-mono text-sm font-semibold text-primary">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {m.time}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-navy">{m.title}</span>
                  <span className="text-sm text-muted-foreground">{m.body}</span>
                </span>
                <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border p-5" aria-labelledby="varian">
        <div>
          <h2 id="varian" className="text-lg font-semibold text-navy">
            Pilih toko demo
          </h2>
          <p className="text-sm text-muted-foreground">Tiga segmen UMKM terbesar, masing-masing toko kecil dengan 30 hari data. Toko demo lama tidak terhapus.</p>
        </div>
        <VariantPicker
          current={profile}
          segments={SEGMENT_PROFILES.map((p) => ({ profile: p, ...pick(p), slug: mine.find((m) => m.profile === p)?.slug ?? null }))}
          others={DEMO_PROFILES.filter((p) => !SEGMENT_PROFILES.includes(p)).map((p) => ({ profile: p, ...pick(p), slug: mine.find((m) => m.profile === p)?.slug ?? null }))}
        />
      </section>

      <Link
        href={shopPath(slug, "staging/qris")}
        className="group flex items-center gap-4 rounded-2xl border border-border p-5 hover:border-primary/40 hover:shadow-md"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky text-white shadow-md shadow-primary/30">
          <QrCode className="h-6 w-6" aria-hidden />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="font-semibold text-navy">QRIS Dinamis + suara (simulasi)</span>
          <span className="text-sm text-muted-foreground">QR unik per transaksi dengan nominal; saat &quot;dibayar&quot;, HP mengumumkan pembayaran. Rencana fase berikutnya.</span>
        </span>
        <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden />
      </Link>

      <section className="rounded-2xl border border-border p-5" aria-label="Tentang WADAR">
        <PitchCard />
      </section>
    </div>
  );
}

function pick(p: (typeof DEMO_PROFILES)[number]) {
  const s = DEMO_SHOPS[p];
  return { name: s.name, segment: s.segment, emoji: s.emoji, tagline: s.tagline, highlights: s.highlights };
}
