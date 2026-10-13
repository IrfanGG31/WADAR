import { Wallet } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Keuangan" };

export default function Page() {
  return <PagePlaceholder title="Keuangan" icon={Wallet} description="Untung bersih, margin per produk dan per kanal, serta penjelasannya akan ada di sini." />;
}
