// Papers kept on this phone (Documents and Papers) are private, so they're forgotten whenever someone signs out,
// however that happens, and each person's copies are kept apart.
export const DOCS_CACHE_PREFIX = "luex-docs-";
export const DOCS_LOCAL_PREFIX = "luex.docs.";

/** Forget every kept paper, except (optionally) this person's own */
export async function forgetPhoneCopies(keepMember?: string): Promise<void> {
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(DOCS_LOCAL_PREFIX) && (!keepMember || !k.endsWith(`.${keepMember}`))) window.localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
  try {
    if (typeof caches === "undefined") return;
    for (const name of await caches.keys()) {
      if ((name === "luex-docs" || name.startsWith(DOCS_CACHE_PREFIX)) && name !== `${DOCS_CACHE_PREFIX}${keepMember ?? ""}`) await caches.delete(name);
    }
  } catch {
    /* nothing kept */
  }
}
