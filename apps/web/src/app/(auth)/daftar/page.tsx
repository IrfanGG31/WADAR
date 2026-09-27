import { Suspense } from "react";
import { DaftarForm } from "./daftar-form";

export default function DaftarPage() {
  return (
    <Suspense>
      <DaftarForm />
    </Suspense>
  );
}
