import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { getShop } from "@/db/shop";
import { getTeam } from "@/db/team";
import { shopPath } from "@/lib/routes";
import { TeamManager } from "./team-manager";

export const metadata = { title: "Anggota tim" };

/** TEAM-1: owner invites staff by link, changes roles, revokes access. */
export default function AnggotaPage({ params }: PageProps<"/[slug]/pengaturan/anggota">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Suspense fallback={<div className="h-5 w-32" />}>
          <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
          <BackLink params={params} />
        </Suspense>
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight">Anggota tim</h1>
        <p className="text-sm text-muted-foreground">Ajak kasir atau admin chat. Mereka hanya melihat menu sesuai perannya.</p>
      </div>
      <Suspense fallback={<TeamSkeleton />}>
        <PageGate params={params} permission="team">
          <Team params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function BackLink({ params }: { params: PageProps<"/[slug]/pengaturan/anggota">["params"] }) {
  const { slug } = await params;
  return (
    <Link href={shopPath(slug, "pengaturan")} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Pengaturan
    </Link>
  );
}

async function Team({ params }: { params: PageProps<"/[slug]/pengaturan/anggota">["params"] }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const { members, invites } = await getTeam(shop.id);
  return <TeamManager slug={slug} members={members} invites={invites} />;
}

function TeamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat anggota tim" className="flex flex-col gap-4">
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
