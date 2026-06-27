# AEGIS — Production Deployment Guide

This document covers deploying AEGIS HSSE to a real production environment.
For local dev, see `README.md`.

---

## 1. Pre-flight checklist

Before you push to production:

- [ ] **PostgreSQL** provisioned (managed: RDS, Cloud SQL, Neon, Supabase). SQLite is dev-only.
- [ ] **Domain + TLS** issued (Let's Encrypt via Caddy / Traefik, or platform-managed).
- [ ] **Secrets generated**:
    - `NEXTAUTH_SECRET` → `openssl rand -base64 48`
    - `CRON_SECRET` → `openssl rand -hex 32`
    - `METRICS_TOKEN` → `openssl rand -hex 32`
    - `DEVICE_INGEST_SECRET` → `openssl rand -hex 32`
- [ ] **`ANTHROPIC_API_KEY`** from <https://console.anthropic.com> (production tier, with budget alerts).
- [ ] **Daily / monthly AI budget** set realistically (see `/admin/autonomy`). Default $50/day is conservative.
- [ ] **`AutonomySettings.permitAutoApproval`** stays `false` for at least the first month — let humans see what Claude would have done first.
- [ ] **Backups** scheduled (nightly DB dumps to off-site storage).
- [ ] **Monitoring** wired (uptime check on `/api/live`, alert on `/api/ready` 503).

---

## 2. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✅ | `production` |
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/aegis?schema=public` |
| `NEXTAUTH_SECRET` | ✅ | ≥24 chars, random |
| `NEXTAUTH_URL` | ✅ | HTTPS URL of your deployment |
| `ANTHROPIC_API_KEY` | ✅ | Claude production key |
| `CLAUDE_MODEL` | optional | Defaults to `claude-sonnet-4-5-20250929` |
| `GEMINI_API_KEY` | optional | For video / vision fallback |
| `CALLMEBOT_PHONE` | optional | WhatsApp number for alerts |
| `CALLMEBOT_APIKEY` | optional | CallMeBot WhatsApp API key |
| `CRON_SECRET` | ✅ in prod | Auth for `/api/autonomy/pipeline/tick` from schedulers |
| `METRICS_TOKEN` | ✅ in prod | Bearer for `/api/metrics` scraper |
| `DEVICE_INGEST_SECRET` | recommended | For ESP32 wearable POSTs |
| `LOG_LEVEL` | optional | `debug` / `info` / `warn` / `error` (default `info`) |
| `SENTRY_DSN` | optional | Error tracking |

The app calls `validateEnv()` at boot and **refuses to start in production** if required vars are missing or look like placeholders.

---

## 3. Deploy with Docker Compose (recommended for VPS)

```bash
# 1. On your server
git clone <repo> /opt/aegis  &&  cd /opt/aegis

# 2. Configure secrets
cp .env.example .env
$EDITOR .env   # paste all values

# 3. Build + start
docker compose up -d --build

# 4. Apply migrations
docker compose exec app npx prisma migrate deploy

# 5. (First run only) seed default data
docker compose exec app npx prisma db seed

# 6. Verify
curl -sS https://your-domain/api/ready | jq
```

The `cron` service inside the compose file polls `/api/autonomy/pipeline/tick` every 2 minutes and runs `/api/compliance/retention` nightly at 3am.

### Updating

```bash
git pull
docker compose build app
docker compose up -d app
docker compose exec app npx prisma migrate deploy
```

---

## 4. Deploy to a managed platform

### Vercel

1. Import the GitHub repo.
2. Set environment variables in the project settings.
3. Use a managed Postgres (Neon, Supabase, Vercel Postgres).
4. `build` command: `npm run build` (already in package.json).
5. `installCommand`: `npm install --include=dev && npx prisma generate`.
6. Add a Vercel Cron pointing to `/api/autonomy/pipeline/tick` (every 2 min) and `/api/compliance/retention` (daily). Use `CRON_SECRET` in the request headers.

### Fly.io / Render / Railway

1. Push the image built from this repo's Dockerfile.
2. Provision Postgres add-on; copy connection string into `DATABASE_URL`.
3. Configure all secrets via the platform's UI.
4. Set `/api/live` as the health-check path.
5. Add a scheduled task / cron job to call the tick endpoint.

---

## 5. Hardening

### Network
- Put AEGIS behind a reverse proxy (Caddy / Traefik / nginx) for TLS termination.
- Block direct access to ports `3000` and `5432` from the public internet.
- Only `/api/wellness/ingest` needs to accept inbound from field devices — restrict by IP or rely on `DEVICE_INGEST_SECRET`.

### Database
- Enable Postgres SSL: append `?sslmode=require` to `DATABASE_URL`.
- Run nightly `pg_dump` → off-site (S3, Backblaze, etc.).
- Set up point-in-time recovery if the platform supports it.

### Secrets
- Never commit `.env` to git (`.env` is gitignored).
- Use the platform's secret store, not env files, when possible.
- Rotate `NEXTAUTH_SECRET` every 90 days. Sessions invalidate on rotation — acceptable.

### Security headers
- Already set in `next.config.ts`: HSTS, X-Frame-Options, CSP, Permissions-Policy.
- Verify with <https://securityheaders.com> after deploy.

---

## 6. Monitoring & observability

### Liveness vs Readiness
| Endpoint | Purpose | Frequency |
|---|---|---|
| `/api/live` | "Process is up" — load balancer health | 5-30s |
| `/api/ready` | DB + env + migrations OK | 30-60s |
| `/api/metrics` | Prometheus scrape | 30s |

### Recommended alerts
- `/api/ready` returns 503 for >2 minutes
- `aegis_ai_cost_micro_usd_today` > 80% of `dailyBudgetUsd`
- `aegis_active_emergencies_total` > 0
- `aegis_wellness_alerts_open` > 5
- Postgres connection error count rises

### Logs
- JSON-line logs go to `stdout` in production — point your log shipper (Loki, Datadog, CloudWatch) at the container.
- Sensitive fields are auto-redacted by the logger (`api_key`, `secret`, `token`, `password`, `authorization`, `cookie`, `bearer`).

---

## 7. AI cost management

The Kill Switch + Cost Guards are **not optional in production**. Verify after deploy:

1. `/admin/autonomy` accessible only to ADMIN / HSSE_MANAGER.
2. `dailyBudgetUsd` and `monthlyBudgetUsd` are set to values you're willing to pay.
3. `maxCallsPerMinute` and `maxCallsPerHour` are conservative.
4. `permitAutoApproval` is **off** until you've reviewed AI recommendations for 30+ days.

If costs spike: flip **globalEnabled** off — no AI runs until you turn it back on. Manual triggers continue to work for emergencies.

---

## 8. Compliance posture

| Standard | Status | Notes |
|---|---|---|
| Oman PDPL (Personal Data Protection Law) | Built-in | `/governance/privacy` exposes data export (Art. 21). Retention policy enforced. |
| ISO 45001 (OH&S) | Aligned | Incident lifecycle, investigations, audit trail in `AuditLog` (7-year retention for HIGH/CRITICAL). |
| MoEM (Ministry of Energy & Minerals) Oman | Partial | Operations + Incident records meet reporting needs. Custom export per-regulator: extend `data-export.ts`. |
| GDPR | Compatible | Same patterns as PDPL. Add EU-resident detection if needed. |

Run the retention sweep weekly:
```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your-domain/api/compliance/retention
```

---

## 9. Disaster recovery

| Scenario | Recovery |
|---|---|
| App container crashes | Auto-restarted by Docker / orchestrator |
| DB unreachable | `/api/ready` returns 503 → traffic drained; restore from latest dump |
| AI provider outage | Autonomous decisions pause via `BudgetExceededError`-style failure path → kill switch protects DB integrity |
| Runaway loop | Flip Demo Mode or globalEnabled in `/admin/autonomy` |
| Data deletion request (PDPL Art. 22) | Use `/api/compliance/data-export` to deliver subject's data, then run user-specific deletion script (see `prisma/seed.ts` patterns) |

---

## 10. First production smoke test

```bash
# Replace https://aegis.example.com with your URL
curl -sS https://aegis.example.com/api/live | jq .alive          # → true
curl -sS https://aegis.example.com/api/ready | jq .ready         # → true
curl -sS -H "Authorization: Bearer $METRICS_TOKEN" \
  https://aegis.example.com/api/metrics | grep aegis_uptime_seconds
```

If all three return correctly, sign in as ADMIN, open `/admin/autonomy`,
flip the demo "Run Tick Now" — you should see audit entries appear in
`/intelligence/audit` within seconds.

You're live.
