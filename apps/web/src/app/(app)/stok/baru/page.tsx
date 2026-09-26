import { redirect } from "next/navigation";
import { getAppContext } from "../../../../lib/app-context";
import { NewProductForm } from "./new-product-form";

export default async function NewProductPage() {
  const { activeOutlet, can } = await getAppContext();
  if (!can("catalog:manage")) redirect("/stok");
  return (
    <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">Tambah produk</h1>
      <p className="mt-1 text-sm text-muted-foreground">Stok awal masuk ke outlet {activeOutlet?.name}.</p>
      <NewProductForm outletId={activeOutlet!.id} />
    </div>
  );
}
