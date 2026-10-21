import { Compass, Store } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Coba demo": into /juri — the guided tour first, or straight to the three segment demo shops
 * (warkop, warung makan, kelontong). `secondary` when it sits under a sign-in form.
 */
export function DemoButtons({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/juri?tur=1" className={cn(buttonVariants({ variant: variant === "primary" ? "default" : "outline", size: "lg" }), "w-full")}>
        <Compass className="h-4 w-4" aria-hidden />
        Ikuti tur demo interaktif (2 menit)
      </Link>
      <Link href="/juri" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
        <Store className="h-4 w-4" aria-hidden />
        Coba toko contoh
      </Link>
    </div>
  );
}
