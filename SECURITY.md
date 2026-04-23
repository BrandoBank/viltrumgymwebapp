# Security Policy — BeeBuildz

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**.
Email the maintainer directly or open a private GitHub security advisory.
Please include steps to reproduce, impact assessment, and any suggested remediation.

---

## Architecture Overview

BeeBuildz is a single-page PWA deployed on Netlify. The attack surface is:

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla JS, single `index.html` | No build step, no bundler |
| Auth | Supabase Auth (email + password) | JWT stored in `localStorage` |
| Database | Supabase (Postgres + PostgREST) | All access via RLS policies |
| AI proxy | Netlify Function (`/api/claude`) | Wraps Anthropic API, key never exposed to client |
| CDN deps | jsdelivr, cdnjs | Pinned with SRI hashes |

---

## Supabase Row Level Security (RLS) Audit

All tables have RLS **enabled**. Policies as of last audit:

### `bb_profiles`
```sql
-- Users can only read/write their own profile row
CREATE POLICY "profiles_select_own" ON bb_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_upsert_own" ON bb_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```
**Threat mitigated:** horizontal privilege escalation — User A cannot read or modify User B's profile.

### `bb_user_data`
```sql
-- Per-user data blob (localStorage mirror + cycle data)
CREATE POLICY "user_data_own" ON bb_user_data
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
**Threat mitigated:** cycle tracking data and all synced app state is readable/writable only by the owning user.

### `bb_events` (analytics)
```sql
-- Users can insert their own events; no SELECT permitted via client
CREATE POLICY "events_insert_own" ON bb_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```
**Threat mitigated:** users cannot read other users' analytics events; cannot spoof another user's user_id.

### `bb_programs`
```sql
-- Per-user saved programs
CREATE POLICY "programs_own" ON bb_programs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Verification command
```sql
-- Run in Supabase SQL editor to verify RLS is on for all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
-- All rows should show rowsecurity = true
```

---

## Threat Model

### In scope
- **Horizontal privilege escalation** via direct Supabase API calls (mitigated by RLS)
- **XSS via user-controlled content** injected into innerHTML (mitigated by `sanitizeHTML()`)
- **CDN supply chain compromise** (mitigated by SRI hashes on all external scripts)
- **API key exposure** — Anthropic key never sent to client; proxied via Netlify Function
- **Claude API abuse** — rate limited (20 req/min/IP), payload size capped, field allowlist enforced
- **Clickjacking** — mitigated by `X-Frame-Options: DENY` and CSP `frame-ancestors: none`
- **MIME sniffing** — mitigated by `X-Content-Type-Options: nosniff`
- **Protocol downgrade** — mitigated by HSTS with 1-year max-age + preload

### Out of scope (accepted risk / future work)
- **`unsafe-inline` in CSP** — required by inline JS architecture; nonce-based CSP is the correct
  fix and is tracked as future work
- **Shared device / physical access** — localStorage is accessible to anyone with device access;
  users are warned in Settings that cycle and health data is stored locally
- **Netlify Function in-memory rate limiter** — resets on cold start; not suitable as sole
  protection against determined abuse. A persistent KV store (Upstash, Netlify Blobs) would
  be the production-grade solution

### Residual risks documented
- `localStorage` persists across browser sessions; clearing site data clears all local app state
- Supabase JWT stored in `localStorage` (Supabase default); susceptible to XSS token theft
  if `unsafe-inline` CSP is ever exploited — HTTPS + SRI reduce this surface significantly

---

## Dependency Versions (as of last audit)

| Package | Version | Source | SRI Hash |
|---------|---------|--------|----------|
| @supabase/supabase-js | 2.45.4 | cdn.jsdelivr.net | sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug |
| pdf.js | 3.11.174 | cdnjs.cloudflare.com | sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e |

---

## Security Headers

Enforced via Netlify `_headers` file on all routes:

- `Content-Security-Policy` — restricts script/connect/frame origins
- `Strict-Transport-Security` — HTTPS enforced for 1 year, preload-eligible
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy` — camera, mic, geolocation, payment, USB all disabled
- `Referrer-Policy: strict-origin-when-cross-origin`
