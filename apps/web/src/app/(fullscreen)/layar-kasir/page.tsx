import type { IncomingPaymentView } from "@wadar/contracts/payments";
import { redirect } from "next/navigation";
import { apiFetchServer } from "../../../lib/api-client-server";
import { getAppContext } from "../../../lib/app-context";
import { CashierDisplay } from "./cashier-display";

export default async function LayarKasirPage() {
  const { can, tenant, activeOutlet } = await getAppContext();
  if (!can("cashier:operate")) redirect("/beranda");
  const incoming = await apiFetchServer<IncomingPaymentView[]>("/v1/payments/incoming?limit=6");
  return <CashierDisplay initial={incoming} storeName={tenant.name} outletName={activeOutlet?.name ?? ""} timezone={tenant.timezone} />;
}
