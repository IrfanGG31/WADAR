import { ArrowLeft, ExternalLink, Search, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { brand } from "@/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { adminListShops, adminOverview, isPlatformAdmin, type ShopKind } from "@/db/admin";
import { listDemoTemplates } from "@/db/demo-templates";
import { formatDateTime } from "@/lib/format-date";
import { AFTER_SIGN_IN_PATH } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { switchToAdmin } from "./actions";
import { ShopRenameRow } from "./shop-rename-row";
import { TemplateForm } from "./template-form";

export const metadata = { title: "Admin WADAR" };

const KINDS: { kind: ShopKind; label: string }[] = [
  { kind: "real", label: "Toko asli" },
  { kind: "demo", label: "Toko demo" },
  { kind: "all", label: "Semua" },
];

/** Panel admin WADAR (ADM-1): every business on WADAR, renameable, plus the demo templates for /juri. Staff allowlist only. */
export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="min-h-dvh bg-surface" data-surface>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2">
            <Image src={brand.mark.src} alt="" width={brand.mark.width} height={brand.mark.height} className="h-6 w-auto" />
            <span className="font-display font-extrabold text-navy">{brand.name}</span>
            <span className="flex items-center gap-1 rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Admin
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/juri" target="_blank" className="hidden items-center gap-1 font-medium text-primary hover:underline sm:flex">
              Lihat /juri <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link href={AFTER_SIGN_IN_PATH} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Tokoku
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 md:px-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  if (!(await isPlatformAdmin())) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-border p-6 text-center">
        <p className="text-lg font-semibold text-navy">Khusus admin WADAR</p>
        <p className="text-sm text-muted-foreground">Akun yang sedang masuk di browser ini bukan akun admin (misalnya akun pengunjung demo).</p>
        <form action={switchToAdmin}>
          <Button type="submit" className="w-full">
            Masuk dengan akun admin
          </Button>
        </form>
      </div>
    );
  }
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const kind: ShopKind = params.jenis === "demo" || params.jenis === "all" ? params.jenis : "real";
  const [overview, shops, templates] = await Promise.all([adminOverview(), adminListShops(query, kind), listDemoTemplates()]);
  const href = (k: ShopKind) => `/admin?jenis=${k}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  const stats = [
    { label: "Usaha terdaftar", value: formatCount(overview.realShops), note: `${formatCount(overview.realNew7d)} baru 7 hari terakhir` },
    { label: "Aktif 7 hari", value: formatCount(overview.realActive7d), note: "ada transaksi minggu ini" },
    { label: "Transaksi 30 hari", value: formatCount(overview.sales30d), note: "semua usaha asli" },
    { label: "Omzet 30 hari", value: formatRupiah(overview.revenue30d), note: "semua usaha asli" },
    { label: "Toko demo", value: formatCount(overview.demoShops), note: "dibuat pengunjung & juri" },
  ];

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="ringkasan">
        <h1 id="ringkasan" className="text-2xl font-semibold tracking-tight text-navy">
          Semua usaha di {brand.name}
        </h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5 rounded-2xl border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              <p className="font-display text-xl font-extrabold tabular-nums text-navy">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="shops">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h2 id="shops" className="text-xl font-semibold tracking-tight text-navy">
              Daftar usaha
            </h2>
            <nav className="flex gap-1" aria-label="Jenis toko">
              {KINDS.map((k) => (
                <Link
                  key={k.kind}
                  href={href(k.kind)}
                  aria-current={kind === k.kind ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium",
                    kind === k.kind ? "bg-navy text-white" : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
                  )}
                >
                  {k.label}
                </Link>
              ))}
            </nav>
          </div>
          <form className="flex w-full max-w-xs items-center gap-2" role="search">
            <input type="hidden" name="jenis" value={kind} />
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={query} placeholder="Cari nama atau slug…" aria-label="Cari toko" />
          </form>
        </div>
        <p className="text-sm text-muted-foreground">
          {shops.length} toko{shops.length === 200 ? " (maks. 200, pakai pencarian)" : ""}. Klik ikon pensil untuk ganti nama; perubahan tercatat di Riwayat aktivitas
          toko itu.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nama usaha</th>
                <th className="px-3 py-2 font-medium">Jenis</th>
                <th className="px-3 py-2 font-medium">Pemilik</th>
                <th className="px-3 py-2 text-right font-medium">Transaksi 30 hr</th>
                <th className="px-3 py-2 text-right font-medium">Omzet 30 hr</th>
                <th className="px-3 py-2 font-medium">Transaksi terakhir</th>
                <th className="px-3 py-2 font-medium">Terdaftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shops.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-3 py-2">
                    <ShopRenameRow id={s.id} name={s.name} slug={s.slug} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={s.isDemo ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"}>
                      {s.isDemo ? `Demo · ${s.demoProfile ?? "-"}` : "Asli"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.ownerEmail ?? (s.isDemo ? "pengunjung demo" : "-")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(s.sales30d)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(s.revenue30d)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{s.lastSaleAt ? formatDateTime(s.lastSaleAt, "Asia/Jakarta") : "belum ada"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(s.createdAt, "Asia/Jakarta")}</td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Tidak ada toko yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="tpl">
        <div>
          <h2 id="tpl" className="text-xl font-semibold tracking-tight text-navy">
            Template toko demo (/juri)
          </h2>
          <p className="text-sm text-muted-foreground">
            Nama dan deskripsi yang tampil di <b>/juri</b> dan dipakai saat toko demo baru dibuat. Toko demo yang sudah ada tidak berubah — ganti namanya di daftar
            usaha (filter Toko demo).
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <TemplateForm key={t.profile} template={t} />
          ))}
        </div>
      </section>
    </>
  );
}
