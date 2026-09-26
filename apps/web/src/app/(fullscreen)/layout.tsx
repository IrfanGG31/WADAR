import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAppContext } from "../../lib/app-context";
import { RealtimeProvider } from "../../lib/realtime";

/** Full-screen surfaces (Layar Kasir) — same auth/tenant as the app shell, no nav chrome. */
export default async function FullscreenLayout({ children }: { children: ReactNode }) {
  try {
    await getAppContext();
  } catch {
    redirect("/onboarding");
  }
  return <RealtimeProvider>{children}</RealtimeProvider>;
}
