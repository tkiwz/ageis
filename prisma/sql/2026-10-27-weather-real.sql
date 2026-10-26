-- Real weather from Open-Meteo: feels-like temperature (heat stress) and dust (sandstorms).
alter table "WeatherReading"
  add column if not exists "feelsLike" double precision,
  add column if not exists "dust" double precision,
  add column if not exists "source" text;
