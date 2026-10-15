import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { AUTHOR_LABEL, conversationChip, escalationLabel } from "@/core/chat/inbox";
import { visitorLabel } from "@/core/chat/widget";
import { getThread } from "@/db/chat";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { AutoRefresh, ThreadControls } from "../thread-controls";

export const metadata = { title: "Percakapan" };

export default function ThreadPage({ params }: PageProps<"/[slug]/chat/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat percakapan…</p>}>
      <Thread params={params} />
    </Suspense>
  );
}

async function Thread({ params }: Pick<PageProps<"/[slug]/chat/[id]">, "params">) {
  const { slug, id } = await params;
  const shop = await getShop(slug);
  const thread = await getThread(shop.id, id);
  if (!thread) notFound();
  const { conversation: c, messages } = thread;
  const chip = conversationChip(c.mode, c.status);
  const reason = c.status === "escalated" ? escalationLabel(c.escalation_reason) : null;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh />
      <div className="flex flex-col gap-2">
        <Link href={shopPath(slug, "chat")} className="flex items-center gap-1 text-sm font-medium text-primary">
          <ChevronLeft className="size-4" /> Semua chat
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {c.channel === "widget" ? visitorLabel(c.external_user_id) : c.external_user_id}
          </h1>
          <Badge variant={chip.tone === "default" ? "default" : chip.tone}>{chip.label}</Badge>
        </div>
        {reason && <p className="text-sm text-muted-foreground">Alasan: {reason}</p>}
      </div>

      <ol className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.author !== "customer";
          return (
            <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-primary/10" : "rounded-bl-sm bg-muted"}`}>
                <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                  {AUTHOR_LABEL[m.author]} · {formatDateTime(m.created_at, shop.timezone)}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 -mx-1 bg-background px-1 pb-2 pt-2">
        <ThreadControls slug={slug} conversationId={c.id} mode={c.mode} />
      </div>
    </div>
  );
}
