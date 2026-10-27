import type { Payment } from "./data";
import type { PaymentDraft } from "./outbox";

/** Add or change one payment (owned by the Payments screen; also opened from This month and Bills). */
export function PaymentSheet(_props: { open: boolean; onOpenChange: (o: boolean) => void; payment?: Payment | null; preset?: Partial<PaymentDraft> }) {
  return null;
}
