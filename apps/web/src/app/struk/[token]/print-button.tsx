"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="mt-6 w-full rounded-md border border-border py-3 font-sans font-medium print:hidden">
      Cetak struk
    </button>
  );
}
