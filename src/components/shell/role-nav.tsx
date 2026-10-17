import { getMyRole } from "@/db/access";
import { getShop } from "@/db/shop";
import { BottomTabs, Sidebar } from "./app-nav";

/** Reads the member's role on the server, so the nav never lists a page they cannot open (CON-6). */
export async function RoleNav({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const role = await getMyRole(shop.id);
  return (
    <>
      <Sidebar role={role} />
      <BottomTabs role={role} />
    </>
  );
}
