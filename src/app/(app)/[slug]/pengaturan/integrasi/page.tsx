import { redirect } from "next/navigation";
import { Suspense } from "react";
import { shopPath } from "@/lib/routes";

/** Replaced by Pusat Koneksi (ADR-003); old links keep working. */
export default function IntegrasiPage({ params }: PageProps<"/[slug]/pengaturan/integrasi">) {
  return (
    <Suspense fallback={null}>
      <Go params={params} />
    </Suspense>
  );
}

async function Go({ params }: { params: PageProps<"/[slug]/pengaturan/integrasi">["params"] }) {
  const { slug } = await params;
  redirect(shopPath(slug, "pengaturan/koneksi"));
  return null;
}
