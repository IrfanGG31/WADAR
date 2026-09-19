import { brand } from "@wadar/brand";

export default function HomePage() {
  return (
    <main>
      <h1>{brand.name}</h1>
      <p>{brand.tagline}</p>
      <p>Fondasi Milestone M0 — dasbor sungguhan menyusul mulai M1/M6.</p>
    </main>
  );
}
