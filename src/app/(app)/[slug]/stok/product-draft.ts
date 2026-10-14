/** Form state of the product editor; shared by the server pages and the client form. */
export interface VariantDraft {
  key: string;
  id?: string;
  option_label: string;
  sku: string;
  price: number | undefined;
  cost: number | undefined;
  min_stock: number;
  lead_time_days: number;
  pack_size: number;
  initial_qty: number;
  /** Existing variants: current stock, shown read-only (use Stok masuk to change it). */
  on_hand?: number;
}

export interface ProductDraft {
  name: string;
  category: string;
  description: string;
  unit: string;
  image_path: string;
  variants: VariantDraft[];
}

export function newVariant(key: string): VariantDraft {
  return {
    key,
    option_label: "",
    sku: "",
    price: undefined,
    cost: undefined,
    min_stock: 5,
    lead_time_days: 3,
    pack_size: 1,
    initial_qty: 0,
  };
}
