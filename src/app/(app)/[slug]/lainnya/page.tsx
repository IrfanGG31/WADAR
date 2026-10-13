import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { MORE_NAV } from "@/components/shell/nav-items";
import { shopPath } from "@/lib/routes";

export const metadata = { title: "Lainnya" };

/** Mobile "Lainnya" tab: every sidebar destination that has no bottom tab of its own. */
export default function LainnyaPage({ params }: PageProps<"/[slug]/lainnya">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Lainnya</h1>
      <Suspense fallback={<div className="h-48 rounded-xl border border-border" />}>
        <MoreLinks params={params} />
      </Suspense>
    </div>
  );
}

async function MoreLinks({ params }: { params: PageProps<"/[slug]/lainnya">["params"] }) {
  const { slug } = await params;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {MORE_NAV.map(({ page, label, icon: Icon }) => (
        <li key={page}>
          <Link href={shopPath(slug, page)} className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
