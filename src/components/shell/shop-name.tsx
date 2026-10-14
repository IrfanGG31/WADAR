import { getShop } from "@/db/shop";

/** Header shop name; also the membership gate for every /<slug>/… page (404 for non-members). */
export async function ShopName({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-semibold">{shop.name}</span>
      {shop.is_demo && (
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-warning">Data contoh</span>
      )}
    </div>
  );
}
