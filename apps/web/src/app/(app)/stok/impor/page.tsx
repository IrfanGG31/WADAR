import { redirect } from "next/navigation";
import { getAppContext } from "../../../../lib/app-context";
import { ImportForm } from "./import-form";

export default async function ImportProductsPage() {
  const { activeOutlet, can } = await getAppContext();
  if (!can("catalog:manage")) redirect("/stok");
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">Impor produk dari Excel</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        File .xlsx atau .csv. Baris pertama berisi judul kolom: <b>Nama</b>, <b>Harga</b> (wajib), lalu opsional <b>Varian</b>, <b>HPP</b>,{" "}
        <b>Stok</b>, <b>SKU</b>, <b>Barcode</b>, <b>Kategori</b>. Stok awal masuk ke {activeOutlet?.name}.
      </p>
      <ImportForm outletId={activeOutlet!.id} />
    </div>
  );
}
