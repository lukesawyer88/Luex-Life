// Small per-browser conveniences (nav collapsed, last company). Storage can be unavailable
// (private windows, blocked storage), so every access is guarded and the app works without it.
export function readLocal(key: string): string | null {
  try {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable – ignore */
  }
}

/** Remove every stored value whose key starts with this (e.g. a person's copies on sign-out) */
export function clearLocalPrefix(prefix: string): void {
  try {
    if (typeof window === "undefined") return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* storage unavailable – ignore */
  }
}
