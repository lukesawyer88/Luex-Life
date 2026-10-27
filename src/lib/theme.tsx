// Light / dark / system appearance. The choice is a per-browser convenience; the boot script
// applies it before the page paints so there is no flash.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { readLocal, writeLocal } from "@/lib/local";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "luex.theme";

export const themeBootScript = `(() => {
  try {
    var c = localStorage.getItem("${KEY}") || "system";
    var dark = c === "dark" || (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();`;

type ThemeState = { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void };
const ThemeContext = createContext<ThemeState>({
  theme: "system",
  setTheme: () => {},
});

function apply(choice: ThemeChoice) {
  if (typeof window === "undefined") return;
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = readLocal(KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      setThemeState(stored);
  }, []);

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    writeLocal(KEY, t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
