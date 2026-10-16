import { NotFoundPanel } from "@/components/states/not-found-panel";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <NotFoundPanel href="/" label="Ke halaman awal" />
    </main>
  );
}
