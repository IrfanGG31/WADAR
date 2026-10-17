"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { serviceWorkerUrl } from "@/lib/service-worker";

/**
 * Registers public/sw.js (app shell + offline page) for the shop being viewed. Production only:
 * in `next dev` cached /_next/static chunks would hide code changes.
 */
export function ServiceWorkerRegister() {
  const { slug } = useParams<{ slug: string }>();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !slug || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(serviceWorkerUrl(slug)).catch((e) => console.error("service worker registration failed", e));
  }, [slug]);
  return null;
}
