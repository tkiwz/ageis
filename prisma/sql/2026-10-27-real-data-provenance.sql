alter table "Site" add column if not exists "operator" text, add column if not exists "source" text;
alter table "Pipeline" add column if not exists "operator" text, add column if not exists "source" text, add column if not exists "isSimulated" boolean not null default false;
