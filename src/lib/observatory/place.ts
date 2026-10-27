/**
 * Detailed 7-day forecast for one wilayat (its main town), hourly + daily,
 * from Open-Meteo. Cached per place for 1 hour.
 */
import { unstable_cache } from "next/cache";
import wilayats from "./wilayats.json";

export interface Wilayat { id: string; name: string; nameAr: string; gov: string; lat: number; lon: number }
export const WILAYATS = (wilayats as { wilayats: Wilayat[] }).wilayats;

export interface PlaceForecast {
  place: Wilayat;
  generatedAt: string;
  current: { time: string; temp: number; feels: number; humidity: number; code: number; wind: number; gust: number; dir: number };
  hourly: { time: string[]; temp: number[]; feels: number[]; humidity: number[]; rainProb: number[]; rain: number[]; code: number[]; wind: number[]; gust: number[]; dir: number[]; uv: number[] };
  daily: { date: string[]; code: number[]; max: number[]; min: number[]; rain: number[]; rainProb: number[]; gust: number[]; sunrise: string[]; sunset: string[]; uv: number[] };
}

const OMAN = "+04:00";
const iso = (local: string) => `${local.length === 16 ? `${local}:00` : local}${OMAN}`;
const nums = (a: (number | null)[]) => a.map((v) => (v === null ? 0 : Math.round(v * 10) / 10));

async function fetchPlace(id: string): Promise<PlaceForecast | null> {
  const place = WILAYATS.find((w) => w.id === id);
  if (!place) return null;
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${place.lat}&longitude=${place.lon}&timezone=Asia%2FMuscat&forecast_days=7`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m"
    + "&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max";
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  const c = j.current, h = j.hourly, d = j.daily;
  return {
    place,
    generatedAt: new Date().toISOString(),
    current: {
      time: iso(c.time), temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      code: c.weather_code, wind: c.wind_speed_10m, gust: c.wind_gusts_10m, dir: c.wind_direction_10m,
    },
    hourly: {
      time: h.time.map(iso), temp: nums(h.temperature_2m), feels: nums(h.apparent_temperature), humidity: nums(h.relative_humidity_2m),
      rainProb: nums(h.precipitation_probability), rain: nums(h.precipitation), code: nums(h.weather_code),
      wind: nums(h.wind_speed_10m), gust: nums(h.wind_gusts_10m), dir: nums(h.wind_direction_10m), uv: nums(h.uv_index),
    },
    daily: {
      date: d.time, code: nums(d.weather_code), max: nums(d.temperature_2m_max), min: nums(d.temperature_2m_min),
      rain: nums(d.precipitation_sum), rainProb: nums(d.precipitation_probability_max), gust: nums(d.wind_gusts_10m_max),
      sunrise: d.sunrise.map(iso), sunset: d.sunset.map(iso), uv: nums(d.uv_index_max),
    },
  };
}

export const getPlaceForecast = unstable_cache(fetchPlace, ["observatory-place-v1"], { revalidate: 3600 });
