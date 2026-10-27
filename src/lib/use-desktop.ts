import { useEffect, useState } from "react";

/** True from the width where the detail window sits beside the list (Tailwind's lg) */
export function useDesktop(): boolean {
  const query = "(min-width: 1024px)";
  const [yes, setYes] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setYes(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return yes;
}
