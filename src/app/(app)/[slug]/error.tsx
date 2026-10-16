"use client";

import { useParams } from "next/navigation";
import { RouteError } from "@/components/states/route-error";
import { shopPath } from "@/lib/routes";

/** Catches a failing page inside the shop shell; the nav and header stay usable. */
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { slug } = useParams<{ slug: string }>();
  return <RouteError error={error} reset={reset} homeHref={slug ? shopPath(slug, "beranda") : undefined} />;
}
