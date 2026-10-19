import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/states/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { AUTHOR_LABEL, buyerLabel, CHANNEL_LABEL, conversationChip, escalationLabel, faqDraftFrom } from "@/core/chat/inbox";
import { can } from "@/core/roles";
import { getMyRole } from "@/db/access";
import { getDeliveries, type DeliveryView } from "@/db/channel-connections";
import { getThread } from "@/db/chat";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { MakeFaq } from "../make-faq";
import { AutoRefresh, DeliveryFailed, ThreadControls } from "../thread-controls";
import { PageGate } from "@/components/shell/page-gate";

export const metadata = { title: "Percakapan" };

export default function ThreadPage({ params }: PageProps<"/[slug]/chat/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton title="Percakapan" shape="thread" />}>
      <PageGate params={params} permission="chat">
        <Thread params={params} />
      </PageGate>
    </Suspense>
  );
}

async function Thread({ params }: Pick<PageProps<"/[slug]/chat/[id]">, "params">) {
  const { slug, id } = await params;
  const shop = await getShop(slug);
  const [thread, role] = await Promise.all([getThread(shop.id, id), getMyRole(shop.id)]);
  const canEditFaq = can(role, "settings");
  if (!thread) notFound();
  const { conversation: c, messages } = thread;
  const deliveries =
    c.channel === "telegram" || c.channel === "whatsapp"
      ? await getDeliveries(messages.filter((m) => m.direction === "out").map((m) => m.id))
      : new Map<string, DeliveryView>();
  const chip = conversationChip(c.mode, c.status);
  const reason = c.status === "escalated" ? escalationLabel(c.escalation_reason) : null;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <div className="flex flex-col gap-2">
        <Link
          href={shopPath(slug, "chat")}
          className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="size-4" aria-hidden /> Semua chat
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{buyerLabel(c)}</h1>
          <Badge variant={chip.tone === "default" ? "default" : chip.tone}>{chip.label}</Badge>
          <span className="text-xs text-muted-foreground">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
        </div>
        {c.customer_id && (
          <Link href={shopPath(slug, `pelanggan/${c.customer_id}`)} className="w-fit text-sm font-medium text-primary hover:underline">
            Lihat data pelanggan
          </Link>
        )}
        {reason && <p className="text-sm text-muted-foreground">Alasan: {reason}</p>}
      </div>

      <ol className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.author !== "customer";
          const draft = !mine && canEditFaq ? faqDraftFrom(messages, m.id) : null;
          const delivery = mine ? deliveries.get(m.id) : undefined;
          return (
            <li key={m.id} className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-primary/10" : "rounded-bl-sm bg-muted"}`}>
                <p className="mb-0.5 text-xs font-medium text-slate-700">
                  {AUTHOR_LABEL[m.author]} · {formatDateTime(m.created_at, shop.timezone)}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
              {delivery?.status === "failed" && <DeliveryFailed slug={slug} messageId={m.id} reason={delivery.last_error} />}
              {draft && <MakeFaq slug={slug} question={draft.question} answer={draft.answer} />}
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
