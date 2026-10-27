// Links from notifications open a page at a tab or an item (?tab=…, ?doc=…). While the app starts, a page can be
// set up more than once, so the first read must not lose the values for the second: they are read once per link,
// kept for a few seconds for that page, and the address bar is tidied straight away.
let saved: { path: string; params: URLSearchParams; at: number } | null = null;

export function takeLinkParams(): URLSearchParams {
  const path = window.location.pathname;
  const fresh = new URLSearchParams(window.location.search);
  if ([...fresh.keys()].length) {
    saved = { path, params: fresh, at: Date.now() };
    window.history.replaceState(window.history.state, "", path);
  }
  if (saved && saved.path === path && Date.now() - saved.at < 5000) return saved.params;
  return new URLSearchParams();
}
