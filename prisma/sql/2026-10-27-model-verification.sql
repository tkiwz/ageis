-- Daily verification of each global model against airport METARs (for the rain blend weights and the accuracy counter)
create table if not exists "ModelVerification" (
  "id" text primary key, "day" date not null, "station" text not null, "model" text not null, "hours" integer not null,
  "tempAbsErrSum" double precision not null, "rainHits" integer not null, "rainMisses" integer not null,
  "rainFalse" integer not null, "rainNone" integer not null, "createdAt" timestamp(3) not null default now()
);
create unique index if not exists "ModelVerification_day_station_model_key" on "ModelVerification" ("day","station","model");
alter table "ModelVerification" enable row level security;
