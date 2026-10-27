// The 15 Luex Life modules (agreed 26 Oct 2026). Adding a module = adding an entry here and its content.
// The shell reads this list to build the menu, the phone bar and the module pages; it never changes per module.
import {
  BadgeDollarSign,
  BookUser,
  CalendarDays,
  Car,
  CookingPot,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  LayoutDashboard,
  MessagesSquare,
  Plane,
  Smile,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Role = "parent" | "member" | "child";

export type ModuleConfig = {
  key: string;
  name: string;
  icon: LucideIcon;
  group: string;
  /** Who sees it by default. The database enforces this as each module's tables are built. */
  /** "adults": every grown-up (not children). */
  audience: "everyone" | "adults" | "parents";
  /** One plain sentence for the module page until the module is built */
  summary: string;
  /** What will live in this module (from the agreed module list) */
  includes: string[];
  /** Launch wave: 1 = first release, 2 = after launch */
  wave: 1 | 2;
  /** Can a family switch it off? The home screen cannot be switched off. */
  canSwitchOff: boolean;
};

export const MODULES: ModuleConfig[] = [
  {
    key: "home", name: "Home", icon: LayoutDashboard, group: "Today", audience: "everyone", wave: 1, canSwitchOff: false,
    summary: "Today for the whole family, and the Luex assistant.",
    includes: ["A simple Today view for each person", "The Luex assistant", "Local and school information", "Weather and activity ideas"],
  },
  {
    key: "calendar", name: "Family Calendar", icon: CalendarDays, group: "Family", audience: "everyone", wave: 1, canSwitchOff: false,
    summary: "One calendar for everyone, with colour-and-icon dots when you zoom out.",
    includes: ["Calendar, chores, routines and cleaning rota", "A reminders tab", "Birthdays, school terms, events and tickets", "Wish lists on each birthday and Christmas"],
  },
  {
    key: "board", name: "Family Board", icon: MessagesSquare, group: "Family", audience: "everyone", wave: 1, canSwitchOff: false,
    summary: "Messages, photos and notes everyone can add to.",
    includes: ["Messages and photos", "Lists and notes", "Family goals", "Journal and memories"],
  },
  {
    key: "food", name: "Food", icon: CookingPot, group: "Food", audience: "everyone", wave: 1, canSwitchOff: true,
    summary: "Meal plan, recipes and the shopping list in one place.",
    includes: ["Meal plan and recipes", "Shopping lists", "Pantry and fridge stock", "Takeaway favourites and packed lunches"],
  },
  {
    key: "money", name: "Household Money", icon: Wallet, group: "Money", audience: "parents", wave: 1, canSwitchOff: true,
    summary: "Bills, subscriptions and shared costs, for parents only.",
    includes: ["Bills and household budget", "Subscriptions", "Savings goals", "Shared expenses and gift budgets"],
  },
  {
    key: "pocket", name: "Rewards and Pocket Money", icon: BadgeDollarSign, group: "Money", audience: "everyone", wave: 1, canSwitchOff: true,
    summary: "Habits and treats for grown-ups, shared rewards, and pocket money for children.",
    includes: ["Habits and personal rewards", "Shared rewards and up-for-grabs jobs", "Pocket money, stars and the reward shop"],
  },
  {
    key: "home-care", name: "Home Care", icon: Home, group: "Home", audience: "everyone", wave: 2, canSwitchOff: true,
    summary: "Repairs, warranties, bins and who to call.",
    includes: ["Repairs and maintenance", "Inventory and warranties", "Meter readings", "Garden, bins and recycling", "Trusted tradespeople", "Moving house checklist"],
  },
  {
    key: "school", name: "School and Activities", icon: GraduationCap, group: "Kids", audience: "everyone", wave: 1, canSwitchOff: true,
    summary: "Homework, clubs, pickups and babysitters.",
    includes: ["What to bring each day", "Clubs and activities", "Pickups and drop-offs", "Forms, trip money and homework", "Babysitters"],
  },
  {
    key: "kids", name: "Kids' Space", icon: Smile, group: "Kids", audience: "everyone", wave: 2, canSwitchOff: true,
    summary: "A simple space for each child.",
    includes: ["Kids' own accounts and calendars", "Screen time rules", "Milestones"],
  },
  {
    key: "health", name: "Family Health", icon: HeartPulse, group: "Health", audience: "parents", wave: 2, canSwitchOff: true,
    summary: "Appointments and reminders. Dates only, never medical records.",
    includes: ["Appointments (dates only)", "Medication reminders", "Wellbeing check-ins", "Vaccination and check-up schedule"],
  },
  {
    key: "documents", name: "Documents and Papers", icon: FileText, group: "Admin", audience: "adults", wave: 1, canSwitchOff: true,
    summary: "Where your important papers are, and when they run out.",
    includes: ["Documents", "Passport and ID expiry dates", "Where important papers are kept"],
  },
  {
    key: "cars", name: "Cars and Renewals", icon: Car, group: "Admin", audience: "parents", wave: 2, canSwitchOff: true,
    summary: "Service, tax, insurance and carpool.",
    includes: ["Vehicles", "Insurance, tax and renewals", "Carpool"],
  },
  {
    key: "contacts", name: "Contacts and Emergency", icon: BookUser, group: "Admin", audience: "everyone", wave: 1, canSwitchOff: false,
    summary: "Who to call and what to do, for everyone in the house and the babysitter.",
    includes: ["Emergency cards with tap-to-call", "Family contacts", "A babysitter view", "Reminder that it never replaces 999 or 112"],
  },
  {
    key: "trips", name: "Trips and Holidays", icon: Plane, group: "Travel", audience: "everyone", wave: 2, canSwitchOff: true,
    summary: "Plan trips, packing lists and days out.",
    includes: ["Trip planning", "Packing lists", "Days out and bucket list"],
  },
  {
    key: "bookings", name: "Bookings and Hosting", icon: Ticket, group: "Travel", audience: "everyone", wave: 2, canSwitchOff: true,
    summary: "Restaurants, activities, services and guests.",
    includes: ["Restaurants, activities and services", "Guests and visitors"],
  },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<string, ModuleConfig>;

/** Whether someone's role lets them open a module. */
export function audienceAllows(m: ModuleConfig, role: Role | undefined): boolean {
  if (m.audience === "parents") return role === "parent";
  if (m.audience === "adults") return role === "parent" || role === "member";
  return true;
}

/** Which modules a person sees: the family has it on, and their role is allowed. */
export function visibleModules(role: Role | undefined, switchedOff: ReadonlySet<string>): ModuleConfig[] {
  return MODULES.filter((m) => {
    if (!audienceAllows(m, role)) return false;
    if (m.canSwitchOff && switchedOff.has(m.key)) return false;
    return true;
  });
}

export function groupModules(list: ModuleConfig[]): { group: string; modules: ModuleConfig[] }[] {
  const out: { group: string; modules: ModuleConfig[] }[] = [];
  for (const m of list) {
    const last = out.find((g) => g.group === m.group);
    if (last) last.modules.push(m);
    else out.push({ group: m.group, modules: [m] });
  }
  return out;
}

export const ROLE_LABEL: Record<Role, string> = { parent: "Parent", member: "Adult", child: "Child" };
