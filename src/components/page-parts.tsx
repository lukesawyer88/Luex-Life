import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A centred card on the plain frame, used by sign-in, setup and join */
export function CentreCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto p-4" style={{ background: "var(--backdrop-base)" }}>
      <div className="glass-panel w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="text-base font-extrabold tracking-[0.32em]">LUEX</div>
          <div className="mx-auto mt-1 h-px w-16" style={{ background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--gold)" }}>Life</div>
          <h1 className="mt-5 text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="glass-tile p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div className="grid h-dvh place-items-center" style={{ background: "var(--backdrop-base)" }}>
      <div className="text-base font-extrabold tracking-[0.32em] opacity-60">LUEX</div>
    </div>
  );
}

/** The grey-blue records window (left). Scrolls inside. */
export function RecordsWindow({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("glass-panel scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4", className)}>{children}</section>;
}

/** The cream detail window (right). Hidden on phones unless asked for. */
export function DetailWindow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside className={cn("glass-tile-dark scrollbar-thin hidden min-h-0 w-full shrink-0 overflow-y-auto p-4 lg:block lg:w-[34%] xl:w-[31%]", className)}>
      {children}
    </aside>
  );
}

export function Windows({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 gap-3">{children}</div>;
}
