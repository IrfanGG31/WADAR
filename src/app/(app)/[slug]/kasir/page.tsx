import { Receipt } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Transaksi" };

export default function Page() {
  return <PagePlaceholder title="Transaksi" icon={Receipt} description="Kasir, catat penjualan dari kanal lain, dan riwayat transaksi akan ada di sini." />;
}
