-- Contractor registry: real companies can be listed before a contract exists.
-- Contact e-mail and contract start become optional; provenance fields added.
alter table "Contractor" alter column "contactEmail" drop not null;
alter table "Contractor" alter column "contractStart" drop not null;
alter table "Contractor"
  add column if not exists "nameAr" text,
  add column if not exists "specialty" text,
  add column if not exists "specialtyAr" text,
  add column if not exists "website" text,
  add column if not exists "source" text;
alter table "Contractor" alter column "status" set default 'PREQUALIFICATION';
