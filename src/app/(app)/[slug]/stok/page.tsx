import { Package } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Stok" };

export default function Page() {
  return <PagePlaceholder title="Stok" icon={Package} description="Stok produk, prediksi tanggal habis, dan saran pesan ulang akan ada di sini." />;
}
