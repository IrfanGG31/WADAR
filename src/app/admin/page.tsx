import { ExternalLink, Search, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { brand } from "@/brand";
import { Input } from "@/components/ui/input";
import { formatCount } from "@/core/number-format";
import { adminListShops, isPlatformAdmin } from "@/db/admin";
import { listDemoTemplates } from "@/db/demo-templates";
import { formatDateTime } from "@/lib/format-date";
import { ShopRenameRow } from "./shop-rename-row";
import { TemplateForm } from "./template-form";

export const metadata = { title: "Admin WADAR" };

/** Panel admin WADAR (ADM-1, first slice): demo templates for /juri + every shop, renameable. Staff allowlist only. */
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
          <Link href="/juri" target="_blank" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Lihat /juri <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
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
  if (!(await isPlatformAdmin())) notFound();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q.slice(0, 60) : "";
  const [templates, shops] = await Promise.all([listDemoTemplates(), adminListShops(query)]);

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="tpl">
        <div>
          <h1 id="tpl" className="text-2xl font-semibold tracking-tight text-navy">
            Template toko demo
          </h1>
          <p className="text-sm text-muted-foreground">
            Nama, pemilik, dan deskripsi yang tampil di <b>/juri</b> dan dipakai saat toko demo baru dibuat. Toko demo yang sudah ada tidak berubah — ganti
            namanya di daftar bawah.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <TemplateForm key={t.profile} template={t} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="shops">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="shops" className="text-xl font-semibold tracking-tight text-navy">
              Semua toko
            </h2>
            <p className="text-sm text-muted-foreground">{shops.length} toko ditampilkan (maks. 100). Ganti nama tercatat di Riwayat aktivitas toko itu.</p>
          </div>
          <form className="flex w-full max-w-xs items-center gap-2" role="search">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={query} placeholder="Cari nama atau slug…" aria-label="Cari toko" />
          </form>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nama toko</th>
                <th className="px-3 py-2 font-medium">Jenis</th>
                <th className="px-3 py-2 font-medium">Pemilik</th>
                <th className="px-3 py-2 text-right font-medium">Penjualan 30 hari</th>
                <th className="px-3 py-2 font-medium">Dibuat</th>
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
                      {s.isDemo ? `Demo · ${s.demoProfile ?? "-"}` : "Toko asli"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.ownerEmail ?? (s.isDemo ? "pengunjung demo (anonim)" : "-")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(s.sales30d)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(s.createdAt, "Asia/Jakarta")}</td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Tidak ada toko yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
