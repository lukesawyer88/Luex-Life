// Short money tips in plain words, matched to age. Written by hand (no AI). One shows each day.

const TIPS: { from: number; to: number; text: string }[] = [
  // 4 to 6
  { from: 4, to: 6, text: "Money is swapped for things. When it's spent, it's gone." },
  { from: 4, to: 6, text: "Putting a little in your save pot each week makes it grow." },
  { from: 4, to: 6, text: "Waiting for something big can feel better than lots of little things." },
  { from: 4, to: 6, text: "Giving some away can make someone else smile." },
  { from: 4, to: 6, text: "Count your money with a grown-up. Coins add up!" },
  { from: 4, to: 6, text: "Stars are earned by helping. Ask what you could do next." },
  // 7 to 10
  { from: 7, to: 10, text: "Before you buy, ask: do I need it, or do I want it?" },
  { from: 7, to: 10, text: "Saving a bit every pay day reaches your goal faster than saving now and then." },
  { from: 7, to: 10, text: "Prices can be different in different shops. It's worth looking around." },
  { from: 7, to: 10, text: "If you wait a day before buying, you'll know if you really want it." },
  { from: 7, to: 10, text: "Interest is extra money you get for keeping your savings saved." },
  { from: 7, to: 10, text: "A budget is a plan for your money before you spend it." },
  { from: 7, to: 10, text: "Adverts are made to make you want things. That's their job." },
  // 11 to 13
  { from: 11, to: 13, text: "In-game purchases add up quickly. Check the total before you tap." },
  { from: 11, to: 13, text: "Try the 'spend, save, give' split: a bit for now, a bit for later, a bit for others." },
  { from: 11, to: 13, text: "A bargain is only a bargain if you were going to buy it anyway." },
  { from: 11, to: 13, text: "Borrowing means paying back later, and that money isn't there for other things." },
  { from: 11, to: 13, text: "Never share passwords or card numbers, even with friends." },
  { from: 11, to: 13, text: "Selling things you no longer use can help you reach a goal." },
  // 14 to 17
  { from: 14, to: 17, text: "When you start work, your payslip shows tax and National Insurance taken off before you're paid." },
  { from: 14, to: 17, text: "Pay yourself first: move savings out on pay day, then spend what's left." },
  { from: 14, to: 17, text: "'Buy now, pay later' is still borrowing. Missed payments can cost more." },
  { from: 14, to: 17, text: "Subscriptions are easy to forget. Check what you pay for every month." },
  { from: 14, to: 17, text: "An emergency pot means a surprise cost doesn't become a problem." },
  { from: 14, to: 17, text: "If an offer sounds too good to be true online, it probably is." },
  { from: 14, to: 17, text: "Your credit history starts when you're 18. Paying on time keeps it healthy." },
];

/** Today's tip for someone of this age (a general one when the age isn't known) */
export function tipFor(age: number | null, day: string): string {
  const a = age == null ? 9 : Math.min(17, Math.max(4, age));
  const list = TIPS.filter((t) => a >= t.from && a <= t.to);
  const n = Math.floor(new Date(day + "T12:00:00Z").getTime() / 86_400_000);
  return list[n % list.length].text;
}
