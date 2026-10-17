import { Bot } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { conversationChip, inboxTab, escalationLabel } from "@/core/chat/inbox";
import { visitorLabel } from "@/core/chat/widget";
import { formatCount } from "@/core/number-format";
import { listInbox } from "@/db/chat";
import { listUnreadNotifications } from "@/db/notifications";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { NotificationList } from "./notification-list";
import { PageGate } from "@/components/shell/page-gate";

export const metadata = { title: "Chat AI" };

const CHIP_VARIANT = { success: "success", warning: "warning", muted: "muted", default: "default" } as const;

export default function ChatPage({ params, searchParams }: PageProps<"/[slug]/chat">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Percakapan pembeli</p>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
      </div>
      <Suspense fallback={<InboxSkeleton />}>
        <PageGate params={params} permission="chat">
          <Inbox params={params} searchParams={searchParams} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Inbox({ params, searchParams }: Pick<PageProps<"/[slug]/chat">, "params" | "searchParams">) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "belum" ? "belum" : "utama";
  const shop = await getShop(slug);
  const [all, notifications] = await Promise.all([listInbox(shop.id), listUnreadNotifications(shop.id)]);
  const waiting = all.filter((c) => inboxTab(c.status) === "belum");
  const rows = tab === "belum" ? waiting : all;
  const base = shopPath(slug, "chat");

  return (
    <>
      <NotificationList slug={slug} items={notifications} times={notifications.map((n) => formatDateTime(n.created_at, shop.timezone))} />
      <nav aria-label="Daftar chat" className="flex flex-wrap gap-2">
        <TabLink href={base} active={tab === "utama"}>
          Semua ({formatCount(all.length)})
        </TabLink>
        <TabLink href={`${base}?tab=belum`} active={tab === "belum"}>
          Belum bisa dijawab ({formatCount(waiting.length)})
        </TabLink>
      </nav>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <Bot className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{tab === "belum" ? "Tidak ada yang menunggu balasanmu." : "Belum ada percakapan."}</p>
          <p className="text-sm text-muted-foreground">
            Bagikan tautan <span className="font-mono">/w/{slug}</span> ke pembeli untuk mulai menerima chat.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((c) => {
            const chip = conversationChip(c.mode, c.status);
            return (
              <li key={c.id}>
                <Link
                  href={`${base}/${c.id}`}
                  className="flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
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
        "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="flex gap-2">
        <div className="h-11 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-11 w-48 animate-pulse rounded-full bg-muted" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
