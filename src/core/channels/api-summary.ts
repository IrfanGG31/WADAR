/** GET /api/v1/summary: today's completed sales, summed in integer rupiah. */
export function summarizeSales(rows: readonly { total: number | string; status: string }[]) {
  let revenue = 0;
  let orders = 0;
  for (const r of rows) {
    if (r.status !== "completed") continue;
    revenue += Number(r.total);
    orders += 1;
  }
  return { revenue, orders };
}
