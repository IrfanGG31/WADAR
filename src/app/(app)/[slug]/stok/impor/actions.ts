"use server";

import {
  MAX_IMPORT_BYTES,
  planImport,
  prepareImport,
  type ColumnOverrides,
  type ImportField,
  type PlannedRow,
  type RowError,
} from "@/core/catalog-import";
import { fetchAllRows } from "@/db/paginate";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";

/** Impor katalog dari CSV (GAP #3): preview dulu, lalu simpan. SKU sama = diperbarui, bukan dobel. */

type Rejected = { error: string; headers?: string[]; unknown?: string[] };

export type PreviewResult =
  | Rejected
  | {
      headers: string[];
      columns: (ImportField | null)[];
      rows: PlannedRow[];
      counts: { create: number; update: number };
      errors: RowError[];
      totalRows: number;
    };

export type ImportResult = Rejected | { created: number; updated: number; errors: RowError[] };

const TOO_BIG = "File terlalu besar (maksimal 2 MB). Pecah jadi beberapa file.";

function prepare(text: string, overrides?: ColumnOverrides) {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false as const, error: TOO_BIG };
  return prepareImport(text, overrides);
}

export async function previewCatalogImport(slug: string, text: string, overrides?: ColumnOverrides): Promise<PreviewResult> {
  const prepared = prepare(text, overrides);
  if (!prepared.ok) return { error: prepared.error, headers: prepared.headers, unknown: prepared.unknown };
  const shop = await getShop(slug);
  const supabase = await createClient();
  try {
    const existing = await fetchAllRows<{ sku: string | null }>((from, to) =>
      supabase.from("variants").select("sku").eq("tenant_id", shop.id).not("sku", "is", null).order("id").range(from, to),
    );
    const plan = planImport(prepared.items, existing);
    return { headers: prepared.headers, columns: prepared.columns, rows: plan.rows, counts: plan.counts, errors: prepared.errors, totalRows: prepared.totalRows };
  } catch (e) {
    console.error("catalog import preview failed", e);
    return { error: "Pratinjau belum bisa dibuat. Coba lagi sebentar." };
  }
}

export async function importCatalog(slug: string, fileName: string, text: string, overrides?: ColumnOverrides): Promise<ImportResult> {
  const prepared = prepare(text, overrides);
  if (!prepared.ok) return { error: prepared.error, headers: prepared.headers, unknown: prepared.unknown };
  if (prepared.items.length === 0) return { created: 0, updated: 0, errors: prepared.errors };

  const shop = await getShop(slug);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_catalog", {
    p_tenant_id: shop.id,
    p_file_name: fileName.slice(0, 200),
    p_rows: prepared.items,
    p_rejected: prepared.errors,
  });
  if (error || !data) {
    console.error("catalog import failed", error);
    return { error: "Impor belum tersimpan (fitur impor belum aktif di database atau koneksi putus). Coba lagi sebentar." };
  }
  const result = data as { created: number; updated: number; errors: RowError[] };
  const errors = [...prepared.errors, ...(result.errors ?? [])].sort((a, b) => a.line - b.line);
  return { created: result.created, updated: result.updated, errors };
}
