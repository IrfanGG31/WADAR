"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TOUR_PARAM } from "@/components/demo/judge-dock";
import { buttonVariants } from "@/components/ui/button";
import { shopPath } from "@/lib/routes";

export function StartTourButton() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Link href={`${shopPath(slug, "beranda")}?${TOUR_PARAM}=1`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      <Compass className="h-4 w-4" aria-hidden /> Mulai tur fitur
    </Link>
  );
}
