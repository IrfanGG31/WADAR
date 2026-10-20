import "server-only";
import { DEMO_PROFILES, DEMO_SHOPS, parseDemoProfile, SEGMENT_PROFILES, type DemoProfile } from "@/core/demo-profiles";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

export interface DemoTemplate {
  profile: DemoProfile;
  name: string;
  owner: string;
  segment: string;
  tagline: string;
  emoji: string;
  onJuri: boolean;
  sort: number;
  highlights: string[];
}

function fallback(): DemoTemplate[] {
  return DEMO_PROFILES.map((p, i) => ({
    profile: p,
    name: DEMO_SHOPS[p].name,
    owner: DEMO_SHOPS[p].owner,
    segment: DEMO_SHOPS[p].segment,
    tagline: DEMO_SHOPS[p].tagline,
    emoji: DEMO_SHOPS[p].emoji,
    onJuri: SEGMENT_PROFILES.includes(p),
    sort: i,
    highlights: DEMO_SHOPS[p].highlights,
  }));
}

/** Demo shop templates edited in /admin (falls back to the built-in copy before the admin_panel migration). */
export async function listDemoTemplates(): Promise<DemoTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("demo_templates").select("profile, name, owner, segment, tagline, emoji, on_juri, sort").order("sort");
  if (error) {
    if (isSchemaPending(error)) return fallback();
    throw error;
  }
  if (!data?.length) return fallback();
  return data.map((r) => {
    const profile = parseDemoProfile(r.profile);
    return {
      profile,
      name: r.name as string,
      owner: r.owner as string,
      segment: r.segment as string,
      tagline: r.tagline as string,
      emoji: r.emoji as string,
      onJuri: Boolean(r.on_juri),
      sort: Number(r.sort),
      highlights: DEMO_SHOPS[profile].highlights,
    };
  });
}
