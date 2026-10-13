import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Pelanggan" };

export default function Page() {
  return <PagePlaceholder title="Pelanggan" icon={Users} description="Daftar pelanggan dan riwayat belanjanya akan ada di sini." />;
}
