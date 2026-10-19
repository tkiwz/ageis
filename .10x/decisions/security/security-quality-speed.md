# security-quality-speed — Security (2026-10-19)
Fixed: cookie-name auth bypass (pages), missing page RBAC, open device APIs (write + read + AI cost), RLS off on 47 tables, dumps tracked.
Accepted risk (owner decision, demo): /api/auth/register gives ADMIN; /api/auth/demo-setup resets demo passwords. Revisit before real users.
Residual: dumps in public git history (demo hashes only); CSRF bypass by presence of x-device-secret header (needs CORS preflight → low).
