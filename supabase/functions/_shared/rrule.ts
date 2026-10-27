// One place for the repeat-rule library. On Supabase's servers the npm package arrives as a default export.
import * as mod from "npm:rrule@2.8.1";

// deno-lint-ignore no-explicit-any
const lib: any = (mod as any).default ?? mod;

export type RRule = { between(after: Date, before: Date, inc?: boolean, iterator?: (d: Date, i: number) => boolean): Date[] };
export const rrulestr: (s: string, opts: { dtstart: Date }) => RRule = lib.rrulestr;
