import { UserRound } from "lucide-react";
import Link from "next/link";
import { shopPath } from "@/lib/routes";

/** Header link to /<slug>/akun (Akun saya: email, toko, hapus akun). */
export async function AccountLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Link
      href={shopPath(slug, "akun")}
      className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <UserRound className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Akun</span>
      <span className="sr-only sm:hidden">Akun saya</span>
    </Link>
  );
}
