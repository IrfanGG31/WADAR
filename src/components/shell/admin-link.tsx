import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { isPlatformAdmin } from "@/db/admin";

/** Header link to the WADAR admin panel, shown only to platform admins. */
export async function AdminLink() {
  if (!(await isPlatformAdmin())) return null;
  return (
    <Link
      href="/admin"
      className="inline-flex h-11 items-center gap-2 rounded-md bg-navy px-3 text-sm font-semibold text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ShieldCheck className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Admin WADAR</span>
      <span className="sr-only sm:hidden">Admin WADAR</span>
    </Link>
  );
}
