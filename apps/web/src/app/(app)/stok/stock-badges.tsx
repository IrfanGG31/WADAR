import type { StockStatus } from "@wadar/contracts/inventory";
import { Badge } from "@wadar/ui-web";

const STATUS: Record<StockStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  aman: { label: "Aman", variant: "success" },
  menipis: { label: "Menipis", variant: "warning" },
  kritis: { label: "Kritis", variant: "danger" },
};

const MISSING_LABEL: Record<"cost" | "photo" | "price", string> = {
  cost: "HPP kosong",
  photo: "Tanpa foto",
  price: "Harga Rp0",
};

export function StatusBadge({ status }: { status: StockStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function MissingBadges({ missing }: { missing: Array<"cost" | "photo" | "price"> }) {
  return (
    <>
      {missing.map((m) => (
        <Badge key={m} variant="muted">
          {MISSING_LABEL[m]}
        </Badge>
      ))}
    </>
  );
}
