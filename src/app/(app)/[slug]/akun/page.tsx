import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { accountConfirmTarget } from "@/core/account-deletion";
import { ROLE_LABEL } from "@/core/roles";
import { getMyAccount } from "@/db/account";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { AccountDeletion } from "./account-deletion";

export const metadata = { title: "Akun saya" };

/** Akun saya: who is signed in, their shops, and "Hapus akun" (GAP #6). Open to every role. */
export default function AkunPage({ params }: PageProps<"/[slug]/akun">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Akun saya</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <Account params={params} />
      </Suspense>
    </div>
  );
}

async function Account({ params }: { params: PageProps<"/[slug]/akun">["params"] }) {
  const { slug } = await params;
  await getShop(slug); // 404 for a non-member
  const account = await getMyAccount();
  if (!account) notFound();

  return (
    <>
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Masuk sebagai</h2>
          <p className="text-sm">{account.email ?? "Akun demo (tanpa email)"}</p>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {account.shops.map((shop) => (
            <li key={shop.slug} className="flex min-h-12 items-center gap-3 px-3 py-2">
              <Link href={shopPath(shop.slug, "beranda")} className="flex-1 truncate text-sm font-medium hover:underline">
                {shop.name}
              </Link>
              {shop.isDemo && <Badge variant="muted">demo</Badge>}
              <Badge variant="outline">{ROLE_LABEL[shop.role]}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <AccountDeletion confirmTarget={accountConfirmTarget(account.email)} />
    </>
  );
}
