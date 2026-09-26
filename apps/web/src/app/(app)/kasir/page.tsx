import type { StockItemView } from "@wadar/contracts/inventory";
import { redirect } from "next/navigation";
import { apiFetchServer } from "../../../lib/api-client-server";
import { getAppContext } from "../../../lib/app-context";
import { Kasir } from "./kasir";

export default async function KasirPage() {
  const { activeOutlet, can, tenant } = await getAppContext();
  if (!can("cashier:operate")) redirect("/beranda");
  if (!activeOutlet) return <p className="p-6 text-sm text-muted-foreground">Belum ada outlet.</p>;
  const products = await apiFetchServer<StockItemView[]>(`/v1/stock?outletId=${activeOutlet.id}`);
  return (
    <Kasir
      products={products}
      outletId={activeOutlet.id}
      outletName={activeOutlet.name}
      storeName={tenant.name}
      canManageProducts={can("catalog:manage")}
    />
  );
}
