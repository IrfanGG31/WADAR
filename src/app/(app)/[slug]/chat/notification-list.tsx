"use client";

import { BellRing, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/core/number-format";
import type { NotificationItem } from "@/db/notifications";
import { shopPath } from "@/lib/routes";
import { markNotificationsRead } from "../pengaturan/notification-actions";

/** GAP #7: unread escalation notifications at the top of the inbox. */
export function NotificationList({ slug, items, times }: { slug: string; items: NotificationItem[]; times: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (items.length === 0) return null;
  return (
    <section aria-label="Notifikasi" className="flex flex-col gap-2 rounded-xl border border-warning/60 bg-warning/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-warning" aria-hidden />
          {formatCount(items.length)} chat perlu kamu balas
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markNotificationsRead(slug);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Tandai sudah dibaca
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((n, i) => (
          <li key={n.id}>
            <Link
              href={n.conversation_id ? shopPath(slug, `chat/${n.conversation_id}`) : `${shopPath(slug, "chat")}?tab=belum`}
              className="flex min-h-11 flex-col rounded-lg px-2 py-1.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="text-sm">{n.body}</span>
              <span className="text-xs text-muted-foreground">{times[i]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
