/**
 * PostgREST caps every response at `max_rows` (Supabase default 1000) and
 * silently drops the rest — that applies to views and set-returning RPCs too.
 * Ask for consecutive ranges until a short page comes back. The query passed
 * in must have a deterministic ORDER BY or pages can overlap.
 */
export const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export interface PageResult {
  data: unknown;
  error: unknown;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`fetchAllRows: more than ${MAX_PAGES * pageSize} rows — narrow the query`);
}
