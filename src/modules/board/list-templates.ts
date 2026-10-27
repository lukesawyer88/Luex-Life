// Built-in list templates. Shopping lists live in Food and packing lists in Trips, so they're not here.
export type ListTemplate = { key: string; title: string; emoji: string; items: string[] };

export const BUILT_IN_TEMPLATES: ListTemplate[] = [
  {
    key: "school-morning", title: "School morning", emoji: "🎒",
    items: ["Get dressed", "Breakfast", "Brush teeth", "Hair brushed", "Pack bag and reading book", "Water bottle", "Coat and shoes on"],
  },
  {
    key: "weekly-basics", title: "Weekly basics", emoji: "🗓️",
    items: ["Bins out", "Wash the school uniforms", "Change the beds", "Water the plants", "Check the week's calendar", "Top up dinner money"],
  },
  {
    key: "cleaning-day", title: "Cleaning day", emoji: "🧽",
    items: ["Hoover downstairs", "Hoover upstairs", "Clean the bathroom", "Wipe kitchen sides", "Mop the floors", "Dust the living room", "Empty the bins"],
  },
  {
    key: "before-bed", title: "Before bed", emoji: "🌙",
    items: ["Tidy toys away", "Bath or shower", "Pyjamas on", "Brush teeth", "Pick a story", "Lights out"],
  },
  {
    key: "weekend-jobs", title: "Weekend jobs", emoji: "🔧",
    items: ["Cut the grass", "Wash the car", "Sort the recycling", "Fix that thing", "Tidy the garden"],
  },
];
