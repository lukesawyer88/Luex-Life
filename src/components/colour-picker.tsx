import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const FAMILY_COLOURS = ["#2f6bd8", "#1d8a4e", "#c27a0e", "#c4321f", "#8e44ad", "#d6336c", "#0e8a8a", "#6b7280"] as const;

export function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {FAMILY_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("grid size-11 place-items-center rounded-full text-white ring-offset-2 ring-offset-[var(--surface)]", value === c && "ring-2 ring-foreground")}
          style={{ background: c }}
        >
          {value === c ? <Check className="size-5" /> : null}
        </button>
      ))}
    </div>
  );
}
