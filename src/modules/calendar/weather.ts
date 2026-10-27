// Weather for the family's town (Open-Meteo). Free plan for testing only: a paid plan is needed before launch.
import { useQuery } from "@tanstack/react-query";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, type LucideIcon } from "lucide-react";

export type DayWeather = { code: number; max: number; min: number; rain: number };

export function weatherLook(code: number): { icon: LucideIcon; label: string } {
  if (code === 0) return { icon: Sun, label: "Sunny" };
  if (code <= 2) return { icon: CloudSun, label: "Some sun" };
  if (code === 3) return { icon: Cloud, label: "Cloudy" };
  if (code === 45 || code === 48) return { icon: CloudFog, label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: CloudDrizzle, label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: CloudRain, label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: CloudSnow, label: "Snow" };
  if (code >= 95) return { icon: CloudLightning, label: "Thunder" };
  return { icon: Cloud, label: "Cloudy" };
}

/** Up to 16 days ahead, by day key. Refreshed every 3 hours at most. */
export function useWeather(lat: number | null | undefined, lon: number | null | undefined, tz: string) {
  return useQuery({
    queryKey: ["weather", lat, lon, tz],
    enabled: lat != null && lon != null,
    staleTime: 3 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lon));
      u.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
      u.searchParams.set("timezone", tz);
      u.searchParams.set("forecast_days", "16");
      const res = await fetch(u);
      if (!res.ok) throw new Error("Weather isn't available right now");
      const j = (await res.json()) as {
        daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
      };
      const out = new Map<string, DayWeather>();
      const d = j.daily;
      if (d) d.time.forEach((k, i) => out.set(k, { code: d.weather_code[i], max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] ?? 0 }));
      return out;
    },
  });
}

export type Place = { name: string; detail: string; lat: number; lon: number };

export async function findTown(q: string): Promise<Place[]> {
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.searchParams.set("name", q.trim());
  u.searchParams.set("count", "6");
  u.searchParams.set("language", "en");
  u.searchParams.set("format", "json");
  const res = await fetch(u);
  if (!res.ok) throw new Error("Couldn't search for towns right now");
  const j = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
  return (j.results ?? []).map((r) => ({ name: r.name, detail: [r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude }));
}
