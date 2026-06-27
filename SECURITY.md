# AEGIS Security Posture

This document covers all security controls in the AEGIS HSSE platform and the
hardening checklist for production deployment.

## 🛡️ Implemented controls

### Authentication & session
- **NextAuth v5** with JWT sessions (1-hour TTL — short blast radius if stolen)
- **bcrypt cost factor 12** (~250ms/hash on modern CPU — slow brute-force)
- **Password policy** (`src/lib/security/password.ts`):
  - Min 12 characters
  - 3 of 4 character classes (upper/lower/digit/symbol)
  - Common-password list rejection
  - Email / name substring rejection
  - Repeating-character rejection
- **Login rate limiting + account lockout** (`src/lib/security/login-tracker.ts`):
  - Per-IP: max 20 attempts / 15 min
  - Per-email: 5 failures / 15 min → 15-min lockout
  - Per-email: 20 failures / 24 h → 24-h lockout
  - Every attempt logged in `LoginAttempt` table

### Authorization
- **RBAC** with 6 roles (`src/lib/rbac.ts`)
- **Site-scoped permissions** (`src/lib/site-access.ts` + `requireScopedAuth`):
  - Per-user grants via `UserSiteAccess`
  - Optional time-bounded + shift-hour-bounded access (for contractors)
  - Applied universally on permits, observations, sites, dashboard, wellness, etc.
- **Routes manually verify access** — `if (!scope.canSee(siteId)) return NOT_FOUND` (masks existence)

### CSRF / Origin
- **Middleware-level CSRF gate** (`src/lib/security/csrf.ts`):
  - All POST/PUT/PATCH/DELETE checked
  - Origin/Referer must match server host
  - Server-to-server exceptions: `x-cron-secret`, `x-device-secret`
- **Content-Security-Policy** + HSTS + X-Frame-Options + Permissions-Policy headers (`next.config.ts`)

### Data integrity
- **Tamper-evident audit log** (`src/lib/security/audit-chain.ts`):
  - Each `AuditLog` row's `hash` is HMAC-SHA256 of its own fields + previous row's hash
  - Daily verification job at `GET /api/security/audit-verify` detects any edit/delete
  - Anchor latest hash off-site for true integrity (see hardening checklist)
- **Idempotency keys** on autonomous writes (LeakAlert, Incident) — replays don't duplicate

### Field-level encryption
- **AES-256-GCM** helpers in `src/lib/security/encryption.ts`:
  - `encryptField()` / `decryptField()` for sensitive PII
  - `deterministicHash()` for indexing encrypted values
  - Key derived from `ENCRYPTION_KEY` env var (falls back to NEXTAUTH_SECRET)
- Currently optional on PII fields — apply per-column as needed

### AI safety
- **Kill switch** (`AutonomySettings`) — single toggle halts ALL autonomous actions
- **Demo mode** — disables background timers, only manual triggers run
- **Cost guard** with reservation pattern (atomic, no race overcommit)
- **Confidence threshold** — AI proposals < 0.85 don't cascade; land in `AISuggestion` for human review
- **Prompt injection guards** in voice/parse:
  - Input wrapped in `<user_input>` tags
  - System prompt explicit "DATA not instructions" rules
  - Action params validated by Zod schemas (`.strict()` — unknown fields rejected)
  - Sensitive actions (lockdown) require HMAC confirmation token from a previous turn

### Privacy & compliance
- **Oman PDPL Article 21** — `/api/compliance/data-export` returns all user-linked data as JSON
- **Audit retention policy** with tiered windows (`src/lib/compliance/retention.ts`):
  - CRITICAL/HIGH events: 7 years
  - MEDIUM: 3 years
  - LOW: 1 year
- **Voice transcripts**: 30 days
- **Wellness raw readings**: 90 days

### Network / transport
- **Security headers** baked into Next.js responses (production)
- **HTTPS dev mode** via `npm run dev:https` / `dev:lan` for Web Speech API testing
- **Service Worker** is network-first in v3 (no stale-cache hijacking)

### Observability
- **Structured logging** (`src/lib/observability/logger.ts`) with automatic secret redaction
- **AI cost ledger** — every Claude / Gemini call tracked with micro-USD precision
- **Brain sessions** — every orchestrator run audited (agents consulted, memories recalled, conclusion)
- **Sentry hook stub** — set `SENTRY_DSN` to enable error capture

---

## ✅ Production hardening checklist

Run through this before exposing AEGIS to the public internet.

### Secrets
- [ ] Rotate all default secrets — never use what's in `.env.example`
- [ ] `NEXTAUTH_SECRET` ≥ 48 chars random (`openssl rand -base64 48`)
- [ ] `CRON_SECRET`, `METRICS_TOKEN`, `DEVICE_INGEST_SECRET` ≥ 32 chars random
- [ ] `ENCRYPTION_KEY` set separately from NEXTAUTH_SECRET (rotation isolation)
- [ ] `AUDIT_CHAIN_SECRET` set + backed up off-site
- [ ] Secrets stored in platform secret manager, NOT in `.env` files

### Database
- [ ] **Use PostgreSQL** (SQLite is dev-only — single file is a huge target)
- [ ] Enable SSL: append `?sslmode=require` to DATABASE_URL
- [ ] Disable remote root login on the DB server
- [ ] Create a dedicated `aegis_app` DB user with only the privileges it needs:
      `SELECT, INSERT, UPDATE, DELETE` on AEGIS tables; no DDL in prod
- [ ] **Encryption at rest** — managed Postgres providers (RDS, Neon, Supabase) handle this; self-hosted: enable LUKS / dm-crypt on data volume
- [ ] **Nightly encrypted backups** to off-site object storage; test restore quarterly
- [ ] Point-in-time recovery enabled
- [ ] DB host on private subnet — no public port 5432

### Network
- [ ] Reverse proxy (Caddy / nginx / Traefik) for TLS termination
- [ ] **Block direct access** to port 3000 — only via reverse proxy
- [ ] **WAF in front** of the app — Cloudflare / AWS WAF with default rules (block known scrapers / CVE patterns)
- [ ] Rate limit at the proxy layer too (defense in depth)
- [ ] `/api/wellness/ingest`, `/api/devices/esp/*` — restrict by source IP (VPN / private subnet)
- [ ] `/api/metrics` — internal only, never publicly reachable

### Application
- [ ] `DISABLE_DEMO_SETUP=1` set in env (blocks `/api/auth/demo-setup`)
- [ ] Delete the `demo-setup` endpoint entirely if you don't need it
- [ ] Enable Sentry: set `SENTRY_DSN` + `npm install @sentry/nextjs`
- [ ] Sign latest audit-chain hash to off-site storage daily
- [ ] Configure log shipper (Loki / Datadog / CloudWatch) to forward JSON logs
- [ ] **2FA / MFA for ADMIN** — TODO (not yet implemented)

### Monitoring
- [ ] Alert when `/api/ready` returns 503 for >2 min
- [ ] Alert when daily AI cost > 80% of budget
- [ ] Alert when audit chain verification fails
- [ ] Alert on >5 failed logins in 5 minutes for any account
- [ ] Alert on autonomy globalEnabled flipped
- [ ] Uptime monitoring on `/api/live`

### Compliance
- [ ] Run `runRetentionSweep(false)` weekly via cron
- [ ] Privacy policy published + linked
- [ ] Data Processing Agreement signed with Anthropic / Google (AI providers)
- [ ] User consent flow for voice / wearable data
- [ ] Audit log immutability — see "off-site hash anchoring" below

### Off-site hash anchoring (for true tamper-evidence)
Every day, fetch the latest `AuditLog.hash` and commit it to an external store
you don't control (e.g. transaction on a public blockchain, Git commit pushed
to a different organization). Then if anyone later edits/deletes from the DB,
verification will detect it AND you can prove the chain existed in a state
that doesn't match.

Minimal version: cron job that posts `{ date, latestHash }` to an external
audit service every 24h.

---

## 🚨 Reporting vulnerabilities

If you find a security issue:
1. **Do NOT** open a public GitHub issue
2. Email security@aegis.local (or your equivalent)
3. Provide steps to reproduce + impact
4. Allow 48 hours for initial response

Critical issues get a hotfix within 24 hours.

---

## 🔬 Threats considered but not yet mitigated

| Threat | Status |
|---|---|
| SQL injection | ✅ Prisma prepared statements; `$queryRaw` not used with concatenated input |
| XSS | ⚠️ Reliant on React auto-escape; no DOMPurify on user-generated HTML (we don't render user HTML) |
| 2FA / MFA | ❌ Not implemented — see roadmap |
| API key system for external integrations | ❌ Not implemented |
| Hardware-token / WebAuthn login | ❌ Not implemented |
| DB-level row-level security | ❌ All scoping is app-level — adversary with raw DB access bypasses it |
| Side-channel attacks on bcrypt | ⚠️ Theoretical; mitigated by cost factor + lockout |
| Supply-chain attacks (`npm install`) | ⚠️ Use `npm ci` in CI; consider `npm audit` in pre-commit |

---

## 📋 Quick test commands

```bash
# Audit chain integrity
curl -H "Cookie: ..." https://aegis.example/api/security/audit-verify | jq

# Force a brute-force test (should lock after 5 failures)
for i in {1..7}; do
  curl -X POST https://aegis.example/api/auth/callback/credentials \
    -d 'email=admin@aegis.local&password=wrong'
done

# Verify CSRF block (should return 403)
curl -X POST https://aegis.example/api/permits \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{}'
```
