export const BUSINESS_TYPES = [
  { value: "fesyen", label: "Fesyen" },
  { value: "fnb", label: "Makanan & minuman" },
  { value: "kecantikan", label: "Kecantikan" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];
