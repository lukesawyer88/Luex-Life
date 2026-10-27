// Loan and mortgage sums for the "what if" screens. Estimates only: monthly interest, paid at the end of each month.

export type Payoff = { months: number; interest: number } | null;

/** Months and total interest to clear a balance at a fixed monthly payment; null when it never clears */
export function payoff(balance: number, ratePct: number, payment: number, cap = 1200): Payoff {
  const r = ratePct / 100 / 12;
  let b = balance;
  let interest = 0;
  for (let m = 1; m <= cap; m++) {
    const i = b * r;
    if (payment <= i && b > 0) return null;
    interest += i;
    b = b + i - payment;
    if (b <= 0.005) return { months: m, interest };
  }
  return null;
}

export type MortgageResult = {
  payment: number;
  paymentAfter: number | null;
  months: number;
  interest: number;
  baseMonths: number;
  baseInterest: number;
};

/**
 * A repayment mortgage: monthly payment, and how long and how much interest with an overpayment,
 * with an optional rate change after some years (the payment is worked out again then).
 */
export function mortgage(opts: { amount: number; ratePct: number; years: number; overpay: number; changeAfterYears?: number | null; newRatePct?: number | null }): MortgageResult | null {
  const { amount, ratePct, years } = opts;
  const n = Math.round(years * 12);
  if (!(amount > 0) || !(n > 0) || ratePct < 0) return null;
  const run = (overpay: number) => {
    let b = amount;
    let r = ratePct / 100 / 12;
    let pay = monthly(amount, r, n);
    const first = pay;
    let after: number | null = null;
    let interest = 0;
    for (let m = 1; m <= n + 1; m++) {
      if (opts.changeAfterYears && opts.newRatePct != null && m === Math.round(opts.changeAfterYears * 12) + 1 && m <= n) {
        r = opts.newRatePct / 100 / 12;
        pay = monthly(b, r, n - m + 1);
        after = pay;
      }
      const i = b * r;
      interest += i;
      b = b + i - pay - overpay;
      if (b <= 0.005) return { first, after, months: m, interest };
    }
    return { first, after, months: n, interest };
  };
  const base = run(0);
  const withOver = run(Math.max(0, opts.overpay));
  return { payment: base.first, paymentAfter: base.after, months: withOver.months, interest: withOver.interest, baseMonths: base.months, baseInterest: base.interest };
}

function monthly(p: number, r: number, n: number) {
  if (n <= 0) return p;
  if (r === 0) return p / n;
  return (p * r) / (1 - Math.pow(1 + r, -n));
}

/** "3 years 4 months" */
export function yearsMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? "year" : "years"}`);
  if (m || !y) parts.push(`${m} ${m === 1 ? "month" : "months"}`);
  return parts.join(" ");
}
