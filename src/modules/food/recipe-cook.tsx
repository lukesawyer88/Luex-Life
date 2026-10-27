// Cooking mode: one big step at a time with the ingredients it needs, timers that keep running, and the screen kept on.
// Where you got to is remembered on this device, so leaving and coming back carries on.
import { ChevronLeft, ChevronRight, Pause, Play, Plus, Timer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readLocal, writeLocal } from "@/lib/local";
import { cn } from "@/lib/utils";

import type { Recipe } from "./data";
import { formatIngredient, scaleQty, type Ingredient } from "./ingredients";

type CookTimer = { id: string; label: string; endsAt: number | null; leftMs: number; done: boolean };
type Saved = { step: number; timers: CookTimer[]; servings: number; at: number };

const KEY = (id: string) => `luex.life.cook.${id}`;
const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

function load(id: string): Saved | null {
  try {
    const raw = readLocal(KEY(id));
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    // forget a cook from more than a day ago
    return Date.now() - s.at < 86_400_000 ? s : null;
  } catch {
    return null;
  }
}

function ding() {
  try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* not on this device */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* no sound */ }
}

export function CookingMode({ recipe, servings: startServings, onClose }: { recipe: Recipe; servings: number; onClose: () => void }) {
  const saved = useMemo(() => load(recipe.id), [recipe.id]);
  const steps = recipe.steps?.length ? recipe.steps : [{ text: "Follow the ingredients list", timer_s: null, uses: [] }];
  const [step, setStep] = useState(() => Math.min(saved?.step ?? 0, steps.length - 1));
  const [timers, setTimers] = useState<CookTimer[]>(saved?.timers ?? []);
  const [servings] = useState(saved?.servings ?? startServings);
  const [now, setNow] = useState(Date.now());
  const [newMins, setNewMins] = useState("");
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // keep the screen on while cooking
  useEffect(() => {
    let gone = false;
    const ask = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === "visible") wake.current = await nav.wakeLock.request("screen");
        if (gone) await wake.current?.release();
      } catch { /* not allowed on this device */ }
    };
    void ask();
    const again = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", again);
    return () => { gone = true; document.removeEventListener("visibilitychange", again); void wake.current?.release().catch(() => {}); };
  }, []);

  // tick, and ring timers that have finished
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setTimers((xs) => {
        let rang = false;
        const out = xs.map((x) => (x.endsAt && !x.done && x.endsAt <= n ? ((rang = true), { ...x, done: true, leftMs: 0, endsAt: null }) : x));
        if (rang) ding();
        return rang ? out : xs;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  // remember where we are
  useEffect(() => {
    writeLocal(KEY(recipe.id), JSON.stringify({ step, timers, servings, at: Date.now() } satisfies Saved));
  }, [recipe.id, step, timers, servings]);

  const s = steps[step];
  const uses: Ingredient[] = (s.uses?.length ? s.uses.map((i) => recipe.ingredients[i]).filter(Boolean) : recipe.ingredients) ?? [];
  const scaled = (i: Ingredient) => ({ ...i, qty: scaleQty(i.qty, recipe.servings, servings) });

  const addTimer = (label: string, seconds: number) =>
    setTimers((xs) => [...xs, { id: crypto.randomUUID(), label, endsAt: Date.now() + seconds * 1000, leftMs: seconds * 1000, done: false }]);
  const toggle = (id: string) =>
    setTimers((xs) => xs.map((x) => (x.id !== id ? x : x.endsAt ? { ...x, endsAt: null, leftMs: x.endsAt - Date.now() } : { ...x, endsAt: Date.now() + x.leftMs })));
  const remove = (id: string) => setTimers((xs) => xs.filter((x) => x.id !== id));

  function finish() {
    writeLocal(KEY(recipe.id), null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6" role="dialog" aria-label={`Cooking ${recipe.title}`}>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{recipe.title}</h2>
        <span className="text-sm text-muted-foreground">Serves {servings}</span>
        <Button variant="outline" className="h-11 rounded-full" onClick={onClose}><X className="size-4" /> Close</Button>
      </div>

      {/* timers */}
      {timers.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {timers.map((t) => {
            const left = t.endsAt ? t.endsAt - now : t.leftMs;
            return (
              <div key={t.id} className={cn("flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm font-semibold", t.done ? "animate-pulse bg-[var(--status-red-soft)] text-[var(--status-red)]" : "bg-[var(--surface)]")}>
                <Timer className="size-4" />
                <span className="max-w-[8rem] truncate">{t.label}</span>
                <span className="tabular-nums">{t.done ? "Done!" : fmt(left)}</span>
                {!t.done ? <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label={t.endsAt ? "Pause timer" : "Start timer"} onClick={() => toggle(t.id)}>{t.endsAt ? <Pause className="size-4" /> : <Play className="size-4" />}</Button> : null}
                <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Remove timer" onClick={() => remove(t.id)}><X className="size-4" /></Button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="scrollbar-thin mt-3 grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-muted-foreground">Step {step + 1} of {steps.length}</p>
          <p className="mt-2 text-2xl leading-snug sm:text-3xl">{s.text}</p>
          {s.timer_s ? (
            <Button className="mt-4 h-12 w-fit rounded-full px-5 text-base" onClick={() => addTimer(`Step ${step + 1}`, s.timer_s!)}><Timer className="size-5" /> Start {Math.round(s.timer_s / 60)} min timer</Button>
          ) : null}
        </div>
        <aside className="rounded-3xl bg-[var(--surface)] p-4">
          <h3 className="mb-2 font-bold">{s.uses?.length ? "For this step" : "Ingredients"}</h3>
          <ul className="space-y-1.5 text-base">
            {uses.map((i, k) => <li key={k}>{formatIngredient(scaled(i))}</li>)}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            <Input aria-label="Timer minutes" className="h-11 w-20" inputMode="numeric" placeholder="Mins" value={newMins} onChange={(e) => setNewMins(e.target.value)} />
            <Button variant="outline" className="h-11 rounded-full" disabled={!(Number(newMins) > 0)} onClick={() => { addTimer(`Timer ${timers.length + 1}`, Math.round(Number(newMins) * 60)); setNewMins(""); }}><Plus className="size-4" /> Timer</Button>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex gap-3">
        <Button variant="outline" className="h-14 flex-1 rounded-full text-lg" disabled={step === 0} onClick={() => setStep((x) => x - 1)}><ChevronLeft className="size-6" /> Back</Button>
        {step < steps.length - 1 ? (
          <Button className="h-14 flex-[2] rounded-full text-lg font-semibold" onClick={() => setStep((x) => x + 1)}>Next <ChevronRight className="size-6" /></Button>
        ) : (
          <Button className="h-14 flex-[2] rounded-full text-lg font-semibold" onClick={finish}>Finished</Button>
        )}
      </div>
    </div>
  );
}
