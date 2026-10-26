# Move AEGIS closer to Oman (Tokyo → Mumbai)

Today the functions run in Vercel `hnd1` (Tokyo) next to the Supabase database
(`ap-northeast-1`). Users are in Oman, so every request travels to Tokyo and back.
Moving **both** to Mumbai cuts that distance by more than half. They must move
together — functions in Mumbai with the database still in Tokyo would be slower.

| Piece    | Now                      | Target                  |
|----------|--------------------------|-------------------------|
| Vercel   | `hnd1` (Tokyo)           | `bom1` (Mumbai)         |
| Supabase | `ap-northeast-1` (Tokyo) | `ap-south-1` (Mumbai)   |

Plan a quiet 30-minute window: anything written between step 2 and step 4 is lost.

## 1. Create the new database (Supabase dashboard)
New project → Region **South Asia (Mumbai) – ap-south-1** → strong password (store it in a password manager).

## 2. Copy schema + data (your terminal, PostgreSQL 15+ client tools)
Use the *direct* connection strings (port 5432) from each project's
**Connect** dialog. Keep them in environment variables — never paste them into chat or commit them.

```bash
export OLD_DB="postgresql://...old direct URL..."
export NEW_DB="postgresql://...new direct URL..."
pg_dump "$OLD_DB" --schema=public --no-owner --no-privileges -Fc -f aegis.dump
pg_restore --dbname="$NEW_DB" --no-owner --no-privileges --clean --if-exists aegis.dump
```
Delete `aegis.dump` afterwards (it contains all data). Then, in the new project's
SQL editor, re-enable RLS on every table (Prisma connects as `postgres`, which bypasses it):

```sql
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
```

## 3. Point Vercel at the new database
Vercel → Project → Settings → Environment Variables (Production):
- `DATABASE_URL` = new **transaction pooler** URL (port 6543) + `?pgbouncer=true&connection_limit=5&pool_timeout=20`
- `DIRECT_URL` = new direct URL (port 5432)

## 4. Switch the function region
Change `vercel.json` to `"regions": ["bom1"]`, commit, push to `main`.
The deploy picks up the new env vars and region together.

## 5. Check, then retire Tokyo
- Sign in, open the dashboard, report a test incident, delete it.
- Security page → **Verify chain** must stay valid (the audit chain copies over as-is).
- Keep the old project paused (not deleted) for a week, then delete it.
