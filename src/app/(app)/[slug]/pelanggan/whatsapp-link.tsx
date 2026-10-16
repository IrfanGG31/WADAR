import { MessageCircle } from "lucide-react";

/** Opens a WhatsApp chat with the customer (wa.me wants the number without "+"). */
export function WhatsAppLink({ phone, name }: { phone: string; name: string }) {
  return (
    <a
      href={`https://wa.me/${phone.replace(/^\+/, "")}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Sapa ${name} di WhatsApp`}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <MessageCircle className="h-5 w-5" aria-hidden />
    </a>
  );
}
