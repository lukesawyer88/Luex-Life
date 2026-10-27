// The babysitter sheet, opened from a link a parent made. No sign-in. Who to call, the children's (and pets') allergies,
// medicines and doctors, where things are and bedtimes. Nothing here is saved on the device.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Loader2, MapPin, PawPrint, Phone, TriangleAlert } from "lucide-react";

import { supabase } from "@/lib/supabase";

type SharedCard = {
  name: string; pet: boolean; colour: string | null; birthday: string | null; allergies: string; medicines: string; blood_group: string | null;
  doctor: string | null; doctor_phone: string | null; microchip: string | null; insurer: string | null; notes: string; conditions: string | null;
};
type Shared = {
  family: string; name: string; expires_at: string;
  home: Record<"address" | "stopcock" | "fuse_box" | "gas_meter" | "first_aid" | "spare_key" | "meet_point" | "plan" | "bedtimes" | "wifi_name" | "wifi_password", string | null>;
  call: { name: string; phone: string | null; phone2: string | null; notes: string }[];
  cards: SharedCard[];
};

const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

function age(b: string | null) {
  if (!b) return null;
  const d = new Date(`${b}T12:00:00Z`), n = new Date();
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a--;
  return a >= 0 && a < 30 ? a : null;
}

export function SharedEmergencyPage() {
  const token = (useParams({ strict: false }) as { token?: string }).token ?? "";
  const q = useQuery({
    queryKey: ["shared-em", token],
    retry: 0,
    staleTime: 60_000,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("em_shared", { p_token: token });
      if (error) throw error;
      return (data ?? null) as Shared | null;
    },
  });
  const d = q.data;
  const h = d?.home;
  const where = h ? ([["Water stopcock", h.stopcock], ["Fuse box", h.fuse_box], ["Gas meter", h.gas_meter], ["First-aid kit", h.first_aid], ["Spare key", h.spare_key]] as const).filter(([, v]) => v) : [];

  return (
    <div className="flex h-dvh flex-col p-3 sm:p-5" style={{ background: "var(--backdrop-base)" }}>
      <div className="glass-panel mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-4 sm:p-6">
        <header className="mb-3 shrink-0 text-center">
          <div className="text-base font-extrabold tracking-[0.32em]">LUEX</div>
          <div className="mx-auto mt-1 h-px w-16" style={{ background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
          {d ? (
            <>
              <h1 className="mt-3 text-2xl font-bold">{d.family}: for the babysitter</h1>
              <p className="text-sm text-muted-foreground">Shared with Luex Life · works until {new Date(d.expires_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
            </>
          ) : null}
        </header>

        {q.isLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div> : null}
        {q.error ? <Message title="Couldn't open this" text="Check your connection and try again." /> : null}
        {!q.isLoading && !q.error && !d ? <Message title="This link has ended or isn't right" text="Ask the family for a new link." /> : null}

        {d && h ? (
          <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" data-testid="sitter-sheet">
            <div className="grid grid-cols-2 gap-3">
              {["999", "112"].map((n) => (
                <a key={n} href={`tel:${n}`} className="flex min-h-16 items-center justify-center gap-2 rounded-3xl bg-[var(--status-red)] text-2xl font-extrabold text-white"><Phone className="size-6" /> {n}</a>
              ))}
            </div>
            {h.address ? (
              <section className="glass-tile p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold text-muted-foreground"><MapPin className="size-4" /> The address</h2>
                <p className="mt-1 whitespace-pre-line text-2xl font-bold">{h.address}</p>
              </section>
            ) : null}
            {d.call.length ? (
              <section>
                <h2 className="mb-2 text-lg font-bold">Who to call</h2>
                <ol className="space-y-2">
                  {d.call.map((c, i) => (
                    <li key={i} className="glass-tile flex items-center gap-3 p-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{c.name}</span>{c.notes ? <span className="block text-sm text-muted-foreground">{c.notes}</span> : null}</span>
                      {c.phone ? <a href={tel(c.phone)} className="flex h-12 items-center gap-2 rounded-full bg-[var(--status-green)] px-4 font-bold text-white"><Phone className="size-5" /> Call</a> : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            {d.cards.length ? (
              <section>
                <h2 className="mb-2 text-lg font-bold">The children{d.cards.some((c) => c.pet) ? " and pets" : ""}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {d.cards.map((c, i) => (
                    <div key={i} className="glass-tile space-y-1 p-4 text-base">
                      <p className="flex items-center gap-2 text-lg font-bold">
                        {c.pet ? <PawPrint className="size-5" /> : <span className="size-4 rounded-full" style={{ background: c.colour ?? "#888" }} />}
                        {c.name}{age(c.birthday) != null ? <span className="text-sm font-normal text-muted-foreground">age {age(c.birthday)}</span> : null}
                      </p>
                      {c.allergies ? <p><span className="font-semibold text-[var(--status-red)]">Allergic to:</span> {c.allergies}</p> : null}
                      {c.medicines ? <p><span className="font-semibold">Medicines:</span> {c.medicines}</p> : null}
                      {c.conditions ? <p><span className="font-semibold">Conditions:</span> {c.conditions}</p> : null}
                      {c.blood_group ? <p><span className="font-semibold">Blood group:</span> {c.blood_group}</p> : null}
                      {c.doctor || c.doctor_phone ? (
                        <p><span className="font-semibold">{c.pet ? "Vet" : "GP"}:</span> {c.doctor} {c.doctor_phone ? <a className="underline" href={tel(c.doctor_phone)}>{c.doctor_phone}</a> : null}</p>
                      ) : null}
                      {c.microchip ? <p><span className="font-semibold">Microchip:</span> {c.microchip}</p> : null}
                      {c.notes ? <p className="text-muted-foreground">{c.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {h.bedtimes ? <Block title="Bedtimes and routines" text={h.bedtimes} /> : null}
            {where.length ? (
              <section className="glass-tile p-4">
                <h2 className="mb-1 text-lg font-bold">Where things are</h2>
                {where.map(([l, v]) => <p key={l} className="text-base"><span className="font-semibold">{l}:</span> {v}</p>)}
              </section>
            ) : null}
            {h.wifi_name ? <Block title="Wi-Fi" text={`${h.wifi_name}${h.wifi_password ? `\nPassword: ${h.wifi_password}` : ""}`} /> : null}
            {h.meet_point || h.plan ? <Block title="If something goes wrong" text={[h.meet_point && `Where we meet: ${h.meet_point}`, h.plan && `Who collects the children: ${h.plan}`].filter(Boolean).join("\n")} /> : null}
            <p className="flex items-start gap-2 rounded-2xl bg-[var(--surface)] p-3 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> In an emergency, call 999 or 112 first, then the family.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <section className="glass-tile p-4">
      <h2 className="mb-1 text-lg font-bold">{title}</h2>
      <p className="whitespace-pre-line text-base">{text}</p>
    </section>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <p className="text-lg font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
