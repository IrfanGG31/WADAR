import { Suspense } from "react";
import { getConsult } from "@/ai";
import { listMemory } from "@/db/memory";
import { getShop } from "@/db/shop";
import { ConsultClient } from "./consult-client";
import { MemoryList } from "./memory-list";

export const metadata = { title: "Konsultasi Bisnis" };

/**
 * Konsultasi Bisnis (PRD §7.2, TECH-SPEC §7.4): ask about the shop and get
 * answers whose numbers come from the core tools. The page only tells the
 * client whether the LLM is available; the thread itself lives in the browser.
 */
export default function KonsultasiPage({ params }: PageProps<"/[slug]/konsultasi">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Dijawab dari data tokomu sendiri</p>
        <h1 className="text-2xl font-semibold tracking-tight">Konsultasi Bisnis</h1>
      </div>
      <Suspense
        fallback={
          <div className="flex flex-col gap-3" aria-hidden>
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            <div className="h-64 animate-pulse rounded-lg bg-muted" />
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
          </div>
        }
      >
        <Body params={params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: PageProps<"/[slug]/konsultasi">["params"] }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const memory = await listMemory(shop.id);
  return (
    <>
      <ConsultClient slug={slug} offlineReason={getConsult().unavailable()} />
      <MemoryList slug={slug} items={memory} />
    </>
  );
}
