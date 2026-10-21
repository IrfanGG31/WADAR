import { getShop } from "@/db/shop";
import { JudgeDock } from "./judge-dock";

/** Renders the "Tur Demo Interaktif" dock only on demo shops. */
export async function JudgeDockLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return shop.is_demo ? <JudgeDock /> : null;
}
