import { Bot } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { conversationChip, inboxTab, escalationLabel } from "@/core/chat/inbox";
import { visitorLabel } from "@/core/chat/widget";
import { listInbox } from "@/db/chat";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Chat AI" };

const CHIP_VARIANT = { success: "success", warning: "warning", muted: "muted", default: "default" } as const;

export default function ChatPage({ params, searchParams }: PageProps<"/[slug]/chat">) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Percakapan pembeli</p>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat percakapan…</p>}>
        <Inbox params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Inbox({ params, searchParams }: Pick<PageProps<"/[slug]/chat">, "params" | "searchParams">) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "belum" ? "belum" : "utama";
  const shop = await getShop(slug);
  const all = await listInbox(shop.id);
  const waiting = all.filter((c) => inboxTab(c.status) === "belum");
  const rows = tab === "belum" ? waiting : all;
  const base = shopPath(slug, "chat");

  return (
    <>
      <nav aria-label="Daftar chat" className="flex gap-2">
        <TabLink href={base} active={tab === "utama"}>
          Semua ({all.length})
        </TabLink>
        <TabLink href={`${base}?tab=belum`} active={tab === "belum"}>
          Belum bisa dijawab ({waiting.length})
        </TabLink>
      </nav>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <Bot className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">{tab === "belum" ? "Tidak ada yang menunggu balasanmu." : "Belum ada percakapan."}</p>
          <p className="text-sm text-muted-foreground">
            Bagikan tautan <span className="font-mono">/w/{slug}</span> ke pembeli untuk mulai menerima chat.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((c) => {
            const chip = conversationChip(c.mode, c.status);
            return (
              <li key={c.id}>
                <Link href={`${base}/${c.id}`} className="flex flex-col gap-1 p-3 hover:bg-muted/50">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.channel === "widget" ? visitorLabel(c.external_user_id) : c.external_user_id}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.last_message_at, shop.timezone)}</span>
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{c.last_content ?? "—"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={CHIP_VARIANT[chip.tone]}>{chip.label}</Badge>
                    {c.status === "escalated" && <span className="text-xs text-muted-foreground">{escalationLabel(c.escalation_reason)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
