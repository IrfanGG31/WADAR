import { digestCaption, type WeeklyDigest } from "@/core/consult/weekly-job";

/** The narrated weekly digest as stored by the Monday job (or the "generate sekarang" button). GAP #5. */
export function WeeklyDigestSummary({ digest }: { digest: Pick<WeeklyDigest, "week_start" | "text" | "generated_by" | "engine"> | null }) {
  if (!digest) return null;
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
      <p className="text-sm">{digest.text}</p>
      <p className="text-xs text-muted-foreground">{digestCaption(digest)}</p>
    </div>
  );
}
