import type { WalletView } from "@wadar/contracts/finance";
import { redirect } from "next/navigation";
import { apiFetchServer } from "../../../../../lib/api-client-server";
import { getAppContext } from "../../../../../lib/app-context";
import { ExpenseForm } from "./expense-form";

export default async function NewExpensePage() {
  const { can } = await getAppContext();
  if (!can("finance:manage")) redirect("/keuangan");
  const wallets = await apiFetchServer<WalletView[]>("/v1/finance/wallets");
  return (
    <div className="mx-auto w-full max-w-lg p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">Catat pengeluaran</h1>
      <ExpenseForm wallets={wallets} />
    </div>
  );
}
