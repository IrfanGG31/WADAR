import { MessagesSquare } from "lucide-react";
import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Konsultasi Bisnis" };

export default function Page() {
  return <PagePlaceholder title="Konsultasi Bisnis" icon={MessagesSquare} description="Tanya apa saja soal tokomu — dijawab dari data tokomu sendiri." />;
}
