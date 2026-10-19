import { Badge } from "@/components/ui/badge";
import { PURCHASE_STATUS_LABEL, type PurchaseStatus } from "@/core/purchasing";

const VARIANT = { draft: "warning", ordered: "default", partial: "default", received: "success", canceled: "muted" } as const;

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge variant={VARIANT[status]}>{PURCHASE_STATUS_LABEL[status]}</Badge>;
}
