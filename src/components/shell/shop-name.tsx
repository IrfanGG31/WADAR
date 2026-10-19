import { getShop } from "@/db/shop";

/** Header shop name; also the membership gate for every /<slug>/… page (404 for non-members). */
export async function ShopName({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-semibold text-navy">{shop.name}</span>
      {shop.is_demo && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Data contoh</span>
      )}
    </div>
  );
}
