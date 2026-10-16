import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Pelanggan" };

export default function Page() {
  return (
    <PagePlaceholder
      title="Pelanggan"
      icon={Users}
      description="Halaman daftar pelanggan belum tersedia di versi ini. Data pelanggan dari Kasir tetap tercatat dan bisa ditanyakan di Konsultasi Bisnis."
    />
  );
}
