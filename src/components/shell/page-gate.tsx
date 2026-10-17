import type { ReactNode } from "react";
import type { Permission } from "@/core/roles";
import { requirePermission } from "@/db/access";

/**
 * Restricted page body (CON-6): `children` is rendered — and so loads its data — only for a
 * member with `permission`; anyone else is redirected to Beranda before any of it runs.
 * Put it inside the page's Suspense, around the component that fetches.
 */
export async function PageGate({
  params,
  permission,
  children,
}: {
  params: Promise<{ slug: string }>;
  permission: Permission;
  children: ReactNode;
}) {
  const { slug } = await params;
  await requirePermission(slug, permission);
  return children;
}
