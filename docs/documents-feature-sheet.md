# Luex Life – Documents and Papers feature sheet

Agreed 27 Oct 2026. Module 8 of 15 (grown-ups). Research: Trustworthy, FamilyVault, Everplans, Google Drive, Apple Files, Dropbox Vault, Evernote.

## Owner's decisions
1. Simple on purpose: Luex Life simplifies and organises home and family life. Only the must-haves and a few small extras are built.
2. Nothing is connected to banks, councils or other apps: papers are photographed or a PDF is added.
3. Snap it, it goes in the right folder, and you're told before it runs out.
4. Household papers (and the children's) are for parents. Every grown-up can keep their own papers "just mine", which nobody else can see, not even parents. Children see nothing here.
5. Push notifications only, as for the rest of the app.

## Built (must have)
1. Ready-made folders (ID and passports, House, Car, Insurance, Money and bank, Health, School, Work, Pets, Other), which parents can rename, reorder or add to.
2. Add a paper by taking photos (several pages) or adding a PDF.
3. Expiry date with a reminder before it runs out (6 months for passports, a month for everything else, changeable).
4. "Where's the original?" (for example "Kitchen drawer" or "Safe").
5. Each person's papers: a paper can be about someone (Mia's passport).
6. Search by name, person, folder or key details.
7. Private: household papers for parents, "just mine" for any grown-up, nothing for children. Set when added and never changed.
8. Download everything as a zip.
9. Big, clear text and buttons.

## Built (small extras)
1. Key details card: reference number, phone number to call and renewal price, so you rarely need to open the scan.
2. Suggested checklist: the papers most households keep, ticked off as they're added.
3. Keep chosen papers on this phone, to open without a signal.

## Not built (could be added later)
1. Share a paper with someone outside the household by link.
2. An "if something happens to me" folder for trusted people.
3. Reading text from scans automatically.
4. Two-step unlock for the module.

## Not possible
1. Fetching papers from banks, councils, HMRC or insurers (no simple connection exists).

## Complaints and fixes
1. Too fiddly to add things – one button: take photos, pick a folder, done.
2. Forgetting renewals – a reminder before anything runs out.
3. Can't find the original – "where it's kept" on every paper.
4. Privacy worries – papers are private to the household's parents or to one grown-up; children never see them.
5. Locked in – download everything as a zip at any time.

## Honest risks
1. Papers are only as complete as what people add; the checklist helps.
2. Phones keep the papers you choose to keep offline; if the phone is shared, those can be opened on it.

## Build status (27 Oct 2026)
Built and live (27 Oct 2026): database changes applied, expiry reminders (hourly check) and nightly tidy scheduled, then the page added to the menu. 60 live checks passed (rolled back).

Checks: 60 Documents database checks (every other module's checks still passing), 69 one-screen checks (two parents, a child and a grandparent at phone, tablet and laptop size), 30 journey tests (adding a passport with a photo and a PDF, "just mine", a grandparent's own paper, search, running out, the checklist, taking out a page, renaming a folder, the zip download, opening a kept paper with no signal, reminders, a child kept out). An independent security review found no way for the wrong person to see papers, and 9 smaller problems. 8 are fixed and tested: kept papers are now forgotten however someone is signed out, and each person's are kept apart; a paper about someone who has left can still be changed; removed papers can't be read and are deleted for good the next night; file names are checked strictly; a page belongs to one paper only; the checklist no longer ticks the wrong item; the zip says if any page was missed and is safe to open in a spreadsheet; a last reminder comes a week before. Follow-up (27 Oct 2026, live): a nightly tidy deletes pages that belong to no paper (a cut-off save or a removed paper), and the "just mine" papers of a grown-up who left the household over 30 days ago (nobody else may see them, so they are deleted rather than handed over). "Keep on this phone" now says that anyone using the phone can open kept papers until you sign out.
