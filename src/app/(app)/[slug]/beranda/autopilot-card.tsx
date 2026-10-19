import { Bot, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatCount } from "@/core/number-format";
import { can } from "@/core/roles";
import { getMyRole } from "@/db/access";
import { listOpenAgentTasks } from "@/db/agent";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";

/** Beranda: what Autopilot prepared, for the owner, when there is something to finish. */
export async function AutopilotCard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  if (!can(await getMyRole(shop.id), "settings")) return null;
  const tasks = await listOpenAgentTasks(shop.id).catch(() => []);
  if (tasks.length === 0) return null;
  const reorder = tasks.filter((t) => t.kind === "reorder").length;
  const faq = tasks.length - reorder;
  const parts = [reorder ? `${formatCount(reorder)} pesanan ulang siap dikirim ke pemasok` : null, faq ? `${formatCount(faq)} usulan FAQ` : null].filter(Boolean);
  return (
    <Link
      href={shopPath(slug, "autopilot")}
      className="flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary/[0.05] p-4 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Bot className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-navy">Disiapkan Autopilot</span>
        <span className="text-sm text-muted-foreground">{parts.join(" · ")}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
