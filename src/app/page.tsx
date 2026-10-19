import { ArrowRight, BookOpen, Check, PackageSearch, ReceiptText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/brand";
import { DemoButtons } from "@/components/demo-buttons";
import { Button } from "@/components/ui/button";
import { AnnouncementPill, BrandLockup, Hero, ProductFrame, SiteHeader } from "@/components/ui/saa-s-template";
import { formatRupiah } from "@/core/money";

/** Public landing page; signed-in visitors are redirected to their shop by src/proxy.ts. */

const LINKS = [
  { href: "#fitur", label: "Yang dikerjakan" },
  { href: "#mulai", label: "Cara mulai" },
  { href: "#coba", label: "Coba demo" },
];

/** Worked example for the money row — integer rupiah, the same order the Keuangan screen uses. */
const EXAMPLE = { sales: 18_536_500, cost: 9_412_000, fees: 1_207_300, expenses: 2_150_000 };
const EXAMPLE_PROFIT = EXAMPLE.sales - EXAMPLE.cost - EXAMPLE.fees - EXAMPLE.expenses;

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader
        links={LINKS}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/masuk">Masuk</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/masuk">Buat toko</Link>
            </Button>
          </>
        }
      />

      <main>
        <Hero
          pill={<AnnouncementPill>Kasir, stok, keuangan, dan chat pembeli dalam satu aplikasi</AnnouncementPill>}
          title={
            <>
              Toko jalan terus.
              <br />
              Angkanya jelas, pembelinya terjawab.
            </>
          }
          description={brand.tagline}
          actions={
            <>
              <DemoButtons />
              <p className="text-xs text-muted-foreground">
                Toko contoh dengan data 90 hari, tanpa daftar.{" "}
                <Link href="/masuk" className="font-medium text-primary underline-offset-4 hover:underline">
                  Sudah punya toko? Masuk
                </Link>
              </p>
            </>
          }
          preview={
            <div className="relative mx-auto max-w-5xl">
              <ProductFrame
                src="/landing/beranda.jpg"
                alt="Beranda toko contoh: penjualan hari ini, grafik 7 hari, dan stok yang menipis"
                width={1280}
                height={820}
                address="Beranda · Glow by Sari"
              />
              <div className="absolute -bottom-10 -right-4 hidden w-44 overflow-hidden rounded-[1.75rem] border-[6px] border-background shadow-[0_24px_48px_-24px_rgb(8_42_92/0.5)] md:block lg:-right-10 lg:w-52">
                <Image src="/landing/kasir.jpg" alt="Layar Kasir di HP" width={780} height={1560} className="h-auto w-full" sizes="208px" />
              </div>
            </div>
          }
        />

        <section id="fitur" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-20 md:px-6 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">Yang dikerjakan untukmu</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy md:text-4xl">
                Bukan cuma mencatat. Memberi tahu sebelum terlambat.
              </h2>
            </div>

            <Feature
              icon={PackageSearch}
              title="Stok dihitung dari penjualan, bukan dari ingatan"
              body="Tiap transaksi Kasir dan pesanan marketplace mengurangi stok. Kalau laju jualnya bikin barang habis sebelum kiriman pemasok datang, kamu diberi tahu berapa yang perlu dipesan."
              points={["Penyesuaian rusak, hilang, retur, dan stok opname tercatat", "Impor pesanan Shopee, TikTok Shop, Tokopedia"]}
            >
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">Serum Vit C 20ml</p>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Kritis</span>
                </div>
                <p className="text-sm text-muted-foreground">Habis ±3 hari lagi. Pemasok butuh 4 hari.</p>
                <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                  <span>Disarankan pesan ulang</span>
                  <span className="font-semibold tabular-nums">40 pcs</span>
                </div>
              </div>
            </Feature>

            <Feature
              icon={ReceiptText}
              title="Untung bersih, bukan sekadar omzet"
              body="Modal per barang, komisi marketplace, diskon, dan pengeluaran toko dipotong otomatis. Yang tersisa adalah uang yang benar-benar jadi milikmu."
              points={["Untung per produk dan per kanal jualan", "Laporan bisa diunduh untuk pembukuan"]}
              flip
            >
              <dl className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background text-sm shadow-sm">
                {[
                  ["Penjualan 7 hari", EXAMPLE.sales, false],
                  ["Modal barang terjual", -EXAMPLE.cost, false],
                  ["Komisi marketplace", -EXAMPLE.fees, false],
                  ["Pengeluaran toko", -EXAMPLE.expenses, false],
                  ["Untung bersih", EXAMPLE_PROFIT, true],
                ].map(([label, value, strong]) => (
                  <div key={String(label)} className={`flex items-center justify-between gap-4 px-4 py-2.5 ${strong ? "bg-muted/60" : ""}`}>
                    <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
                    <dd className={`tabular-nums ${strong ? "text-base font-bold text-navy" : ""}`}>
                      {Number(value) < 0 ? `−${formatRupiah(-Number(value))}` : formatRupiah(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Contoh perhitungan dari toko contoh.</p>
            </Feature>

            <Feature
              icon={BookOpen}
              title="Pembeli terjawab, kamu tetap pegang kendali"
              body="Asisten menjawab dari daftar produk, info toko, FAQ, dan dokumenmu sendiri. Yang tidak ia tahu, ia tidak mengarang: chat diteruskan ke kamu."
              points={["Satu ketuk: jadikan pertanyaan pembeli sebagai FAQ", "Harga modal dan untung tidak pernah dibagikan ke pembeli"]}
            >
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4 text-sm shadow-sm">
                <p className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2">Kak, bisa COD ke Bekasi?</p>
                <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
                  Bisa kak, COD tersedia untuk Jabodetabek. Ongkir mulai Rp10.000 ya.
                </p>
                <p className="self-end text-xs text-muted-foreground">Dijawab dari: Info toko › Pengiriman</p>
              </div>
            </Feature>
          </div>
        </section>

        <section id="mulai" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-navy md:text-4xl">Mulai dalam satu sore</h2>
            </div>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
              {[
                ["Buat toko", "Nama toko, alamat link, dan jenis usaha. Kanal jualan dan komisinya disiapkan otomatis."],
                ["Masukkan produk", "Satu per satu dengan varian dan foto, atau impor dari Excel sekaligus ratusan produk."],
                ["Mulai jualan", "Catat di Kasir, impor pesanan marketplace, dan bagikan link chat toko ke pembeli."],
              ].map(([title, body], i) => (
                <li key={title} className="flex flex-col gap-2 bg-background p-6">
                  <span className="font-display text-sm font-bold text-primary tabular-nums">0{i + 1}</span>
                  <p className="text-lg font-semibold">{title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="coba" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
            <div className="overflow-hidden rounded-3xl bg-navy p-10 text-white md:p-14">
              <div className="grid items-center gap-8 md:grid-cols-2">
                <div>
                  <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Lihat dulu dengan toko contoh</h2>
                  <p className="mt-3 max-w-md text-white/75">
                    90 hari penjualan, stok, pengeluaran, dan chat pembeli. Coba catat transaksi, lihat untungnya berubah.
                  </p>
                </div>
                <div className="flex flex-col gap-3 md:items-end">
                  <div className="w-full max-w-sm rounded-xl bg-background p-4 text-foreground">
                    <DemoButtons />
                  </div>
                  <Link href="/masuk" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-white/85 hover:text-white">
                    Atau langsung buat tokomu <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <BrandLockup />
          <div className="flex gap-6">
            <Link href="/privasi" className="hover:text-foreground">
              Kebijakan privasi
            </Link>
            <Link href="/masuk" className="hover:text-foreground">
              Masuk
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
  points,
  children,
  flip = false,
}: {
  icon: typeof Check;
  title: string;
  body: string;
  points: string[];
  children: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <article className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
      <div className={flip ? "md:order-2" : undefined}>
        <Icon className="h-6 w-6 text-primary" aria-hidden />
        <h3 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy">{title}</h3>
        <p className="mt-3 leading-relaxed text-muted-foreground">{body}</p>
        <ul className="mt-5 flex flex-col gap-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "md:order-1" : undefined}>{children}</div>
    </article>
  );
}
