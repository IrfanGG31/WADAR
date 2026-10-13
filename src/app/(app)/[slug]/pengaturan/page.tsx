import { Settings } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Pengaturan" };

export default function Page() {
  return <PagePlaceholder title="Pengaturan" icon={Settings} description="Profil toko, kanal & komisi, dan kebijakan toko akan ada di sini." />;
}
