// A Home screen card for parents: medicine due around now, with the "given" tick right there.
import { DoseRow, useDoseNow } from "./dose";

export function MedicineNow() {
  const { slots, today } = useDoseNow();
  if (!slots.length) return null;
  return (
    <div className="mb-4" data-testid="home-medicine">
      <h3 className="mb-1.5 text-sm font-semibold">💊 Medicine</h3>
      <ul className="space-y-1.5">{slots.map((s) => <DoseRow key={`${s.med.id}-${s.at}`} s={s} day={today} />)}</ul>
    </div>
  );
}
