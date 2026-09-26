/**
 * POS cart state shared by web (and the Expo app later — ARCHITECTURE §13).
 * Client-side totals are a PREVIEW: the API re-prices from the catalog and
 * is authoritative (sales module), so these only drive the on-screen sum.
 */
export interface CartItem {
  variantId: string;
  name: string;
  unitPrice: number;
  qty: number;
  /** Rupiah off the whole line. */
  discount: number;
}

export interface Cart {
  items: CartItem[];
  /** Rupiah off the whole order. */
  discount: number;
}

export const emptyCart: Cart = { items: [], discount: 0 };

export type CartAction =
  | { type: "add"; item: Omit<CartItem, "qty" | "discount">; qty?: number }
  | { type: "setQty"; variantId: string; qty: number }
  | { type: "setLineDiscount"; variantId: string; discount: number }
  | { type: "setOrderDiscount"; discount: number }
  | { type: "remove"; variantId: string }
  | { type: "clear" };

const clampDiscount = (discount: number, max: number) => Math.max(0, Math.min(Math.round(discount), max));

export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "add": {
      const existing = cart.items.find((i) => i.variantId === action.item.variantId);
      const qty = action.qty ?? 1;
      const items = existing
        ? cart.items.map((i) => (i.variantId === action.item.variantId ? { ...i, qty: i.qty + qty } : i))
        : [...cart.items, { ...action.item, qty, discount: 0 }];
      return { ...cart, items };
    }
    case "setQty": {
      if (action.qty <= 0) return cartReducer(cart, { type: "remove", variantId: action.variantId });
      return {
        ...cart,
        items: cart.items.map((i) =>
          i.variantId === action.variantId
            ? { ...i, qty: action.qty, discount: clampDiscount(i.discount, action.qty * i.unitPrice) }
            : i,
        ),
      };
    }
    case "setLineDiscount":
      return {
        ...cart,
        items: cart.items.map((i) =>
          i.variantId === action.variantId ? { ...i, discount: clampDiscount(action.discount, i.qty * i.unitPrice) } : i,
        ),
      };
    case "setOrderDiscount":
      return { ...cart, discount: clampDiscount(action.discount, cartSubtotal(cart)) };
    case "remove": {
      const next = { ...cart, items: cart.items.filter((i) => i.variantId !== action.variantId) };
      return { ...next, discount: clampDiscount(next.discount, cartSubtotal(next)) };
    }
    case "clear":
      return emptyCart;
  }
}

/** After line discounts, before the order discount. */
export function cartSubtotal(cart: Cart): number {
  return cart.items.reduce((sum, i) => sum + i.qty * i.unitPrice - i.discount, 0);
}

export function cartTotal(cart: Cart): number {
  return cartSubtotal(cart) - cart.discount;
}

export function cartItemCount(cart: Cart): number {
  return cart.items.reduce((sum, i) => sum + i.qty, 0);
}

/**
 * Quick cash buttons: exact amount, then the next round notes above it
 * (Rp10rb/20rb/50rb/100rb), deduplicated — the way cashiers actually
 * receive money.
 */
export function suggestCashAmounts(total: number): number[] {
  if (total <= 0) return [];
  const suggestions = new Set<number>([total]);
  for (const note of [5_000, 10_000, 20_000, 50_000, 100_000]) {
    const rounded = Math.ceil(total / note) * note;
    if (rounded > total) suggestions.add(rounded);
    if (suggestions.size >= 4) break;
  }
  return [...suggestions].sort((a, b) => a - b).slice(0, 4);
}
