// Small building blocks shared by the calendar screens.
import type { ReactNode } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Member } from "@/lib/family";
import { cn } from "@/lib/utils";

/** A dialog that fills a phone screen and scrolls inside, with a fixed footer for the main buttons */
export function Sheet({
  open, onOpenChange, title, description, children, footer, wide,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-dvh max-h-dvh flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onOpenAutoFocus={(e) => {
          // let the first field take focus only when it asks for it
          if (!(e.currentTarget as HTMLElement).querySelector("[data-autofocus]")) e.preventDefault();
        }}
      >
        <DialogHeader className="border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="pr-8 text-lg">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{typeof title === "string" ? title : "Details"}</DialogDescription>}
        </DialogHeader>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}

/** A round toggle button with an optional icon */
export function Chip({ on, onClick, children, className, title, disabled }: { on: boolean; onClick: () => void; children: ReactNode; className?: string; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition disabled:opacity-50",
        on ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)] hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Pick people by tapping their pictures */
export function PeoplePicker({
  members, value, onChange, single, allowNone = true,
}: {
  members: Member[]; value: string[]; onChange: (ids: string[]) => void; single?: boolean; allowNone?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const on = value.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (single) onChange(on && allowNone ? [] : [m.id]);
              else onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id]);
            }}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition",
              on ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)] hover:bg-muted",
            )}
          >
            <MemberAvatar member={m} size="sm" className="ring-0 ring-offset-0" />
            {m.display_name}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold">{label}</div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-[var(--surface)] text-muted-foreground"><Icon className="size-7" /></span>
      <h3 className="font-bold">{title}</h3>
      {children ? <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

/** Tabs across the top of the calendar (and inside other screens) */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string; icon?: React.ComponentType<{ className?: string }> }[] }) {
  return (
    <div role="tablist" className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {items.map((it) => {
        const Icon = it.icon;
        const on = it.key === value;
        return (
          <button
            key={it.key}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition",
              on ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)] text-foreground hover:bg-muted",
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
