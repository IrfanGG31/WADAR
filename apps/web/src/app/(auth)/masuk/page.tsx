import { Suspense } from "react";
import { MasukForm } from "./masuk-form";

export default function MasukPage() {
  return (
    <Suspense>
      <MasukForm />
    </Suspense>
  );
}
