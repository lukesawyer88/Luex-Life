# Luex Life – Food feature sheet

Agreed 27 Oct 2026. Module 4 of 15. Research: Paprika, Mealime, Samsung Food (Whisk), Plan to Eat, AnyList, Bring!, OurGroceries, Listonic, FridgeBuddy.

## Owner's decisions
1. Build every must-have and the niche items marked below. Ultra niche not chosen is a reference list only.
2. Fix every complaint in the complaints list.
3. The family shopping list lives here (not on the Board).
4. No supermarket ordering and no "copy list to send": Food is self-contained.
5. Allergies: simple "avoid" tags per person, a warning when a planned meal clashes, and "Always check labels". Get the same adviser view as for Family Health.
6. Stock is light: use-soon items and the freezer, not every cupboard item.
7. Calories and macros: opt-in per grown-up; never shown to children or on shared screens (kitchen wall, Home).
8. Scanning cookbook pages and receipts uses text recognition on the phone itself (free, nothing sent away), always followed by a check screen. No AI.
9. Push notifications only, as for the rest of the app.

## Must have
1. Weekly meal plan (breakfast, lunch, dinner, snacks); copy, move and repeat ("same as last week").
2. Recipe box: photos, ingredients, steps, servings, timings, tags.
3. Import a recipe from a website link, with its photo.
4. Scale servings to any number; the servings travel with the meal to the plan and the shopping list.
5. One tap from plan to shopping list, with matching ingredients combined and "already have" unticked.
6. Family shopping list: real-time, grouped by editable aisles in your own order; who added each item; note and photo per item; quantities, favourites and recent items.
7. Ticked items drop to the bottom; "Clear ticked"; undo on every delete.
8. Several lists (weekly shop, chemist, DIY shop).
9. Cooking mode: screen stays on, ingredients beside each step, timers, progress kept.
10. Allergies and dislikes per person: clash warning and filters.
11. Search and filter recipes (name, ingredient, tag, time, who likes it).
12. Family ratings (thumbs up or down per person).
13. "What's for dinner" on Home and the kitchen wall screen.
14. Readable without a signal (especially in the shop).
15. No ads, no paying again for updates, cloud-saved.
16. Export recipes (PDF or file) at any time.
17. Grandparent-proof: big text, few taps, obvious Add and Tick.

## Niche (agreed)
1. Fridge, freezer and cupboard stock, light: use-soon items and freezer, use-by alerts, running low adds to the list.
2. Barcode scanning (Open Food Facts) for stock and shopping items; typing always works.
3. Shopping list knows what's in stock.
4. Leftovers and batch cooking ("makes 2 nights", "freeze 3 portions" updates the freezer).
5. Packed lunches planner per child, with a lunchbox list.
6. Takeaway favourites: each person's usual order, phone or link, last ordered.
7. Who's cooking tonight (cooking rota, shown on the calendar).
8. Meal ideas from what's in stock.
9. Children request a dinner; a parent approves it.
10. Food budget: the total of each shop, typed in after paying (links to Household Money later).
11. Recipe collections (family classics, Gran's recipes, quick weeknights).
12. Notes and history on each recipe ("made 12 times", "less chilli").
13. Nutrition per serving: optional, off by default, no "health scores".
14. Seasonal menus with a cooking timeline (Christmas dinner).
15. Give a shopping item to a person ("Pat's getting the milk").
16. Scan a cookbook page into a recipe (on-phone text recognition; tap which lines are ingredients and steps). Printed books work well; handwriting mostly won't.
17. Calorie and macro tracking for grown-ups who switch it on (estimates; Open Food Facts plus a free ingredient database).
18. Receipt scanning to fill stock, with a "Check these" screen.

## Not wanted
1. Price per item and estimated shop totals.
2. Copy the list to send to a supermarket or message.

## Ultra niche (reference only, not built)
1. Ordering from Tesco, Sainsbury's, Asda, Ocado – no.
2. AI-generated meal plans – no (a job for the Luex assistant later, if ever).
3. Alexa and Siri – no.
4. Watch apps – after launch, once the store apps exist (separate Apple Watch and Wear OS builds).
5. Smart fridges and scales – no common standard; only if one device becomes popular with families.
6. Wine pairing – no.
7. Supermarket price comparison – no.

## Complaints and fixes
1. Clunky, many-tap screens (Paprika, AnyList) – one tap to add, tick and plan; one screen.
2. Plan doesn't feed the list (Paprika) – one tap adds the week's ingredients, combined.
3. Servings lost between recipe, plan and list (Samsung Food) – servings travel with the meal.
4. Deletes lose items; ticked items clutter (AnyList, Bring!) – undo everywhere; ticked items drop down; "Clear ticked".
5. Aisles can't be renamed or reordered; wrong categories (Bring!, Samsung Food) – editable aisles that remember each item.
6. Can't see who added an item (Samsung Food) – shown on every item.
7. Paying again for updates; lost recipes (Paprika) – one family price, cloud-saved, export any time.
8. Ingredients and steps on separate tabs (Paprika) – each step shows its ingredients.
9. Scaling mistakes (Paprika) – quantity and unit scale together.
10. Plans can't be edited; portions too small for big families (Mealime) – fully editable, any servings.
11. Upsells and ads (Mealime, Samsung Food) – none.
12. Preachy health labels (Samsung Food) – nutrition optional and neutral.
13. Stock and list don't talk (Paprika) – linked.

## Gaps owned by other modules
1. Budget totals across the household – Household Money.
2. Dinner times and who's cooking on the calendar – Calendar (Food sends them).
3. Allergies as medical records – Family Health (Food keeps "avoid" tags only).
4. Party and holiday catering – Trips and Holidays; Bookings and Hosting.
5. Non-food lists – Family Board.
6. Kids' cooking games – Kids' Space.

## Honest risks
1. Recipe import won't work on every site (some block it); imported recipes stay private to the family.
2. Barcode data (Open Food Facts) is patchy for UK own-brand products.
3. Text recognition: printed text good, handwriting and shortened receipt names poor; always a check screen.
4. Calorie figures are estimates; kept away from children.
5. Allergy warnings are a help, never a guarantee.

## Build status (27 Oct 2026)
Built and live (27 Oct 2026): database changes applied, use-by alerts and nightly tidy scheduled, recipe-import service switched on (checks sign-in). 16 live checks passed (rolled back).

Checks: 65 Food database security checks (Calendar 158 and Board 153 still passing), 66 one-screen checks (parent, child, grandparent at phone, tablet and laptop size), 17 Food journey tests, 4 ingredient unit tests. An independent security review found 7 problems inside a family (none across families); all fixed and tested.

Known limits: recipe import doesn't work on every site; the first page or receipt scan downloads the text reader (a few MB) from the internet; barcode data is patchy for UK own-brand items; only adds and ticks wait for a signal on the shopping list; meals can't be dragged within a day.
