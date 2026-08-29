# Deployment

Target: a public URL a judge opens in a browser with **no login**.

## 1. Prerequisites

- Node 20 LTS or newer, pnpm 9
- Optional: a Postgres database (any provider). Without it the app runs on the in-memory store and still
  completes every demo case — cases just don't survive a restart.
- Optional: an OpenAI API key. Without it the app runs in deterministic fallback mode.

## 2. Local setup

```bash
git clone <repo> scholarship-saathi && cd scholarship-saathi
pnpm install
cp .env.example .env.local
pnpm db:push        # applies lib/db/schema.sql if DATABASE_URL is set; otherwise prints "memory store"
pnpm seed           # loads gov_* synthetic records + verifies the 3 demo cases resolve
pnpm dev            # http://localhost:3000
```

`pnpm seed` must end with:
```
Seeded 3 demo applications — all records are synthetic.
Self-check: case 1 -> RESOLVED, case 2 -> ESCALATED, case 3 -> RESOLVED. OK
```
If the self-check fails, the build is not deployable. It runs the engine headlessly against the seeded
records, so it catches a broken diagnosis before a judge does.

## 3. Environment variables

```bash
OPENAI_API_KEY=sk-...          # optional; unset => fallback mode
OPENAI_MODEL=gpt-4.1-mini      # must be vision-capable to read screenshots
OPENAI_TIMEOUT_MS=12000
DATABASE_URL=postgres://...    # optional; use a pooled/serverless connection string
APP_BASE_URL=https://<your-domain>
RATE_LIMIT_PER_MIN=30
DEMO_MODE_ONLY=false           # set true for a hardened public demo: only seeded cases, /start disabled
MOCK_FAILURE_RATE=0            # >0 only for testing the UNKNOWN paths
LOG_LEVEL=info
```

Set every one of these in the Vercel project settings for **Production** and **Preview**.
`OPENAI_API_KEY` must never appear in a `NEXT_PUBLIC_` variable — `scripts/check-boundaries.ts` fails the
build if it does.

## 4. Database setup

If using Postgres:
```bash
psql "$DATABASE_URL" -f lib/db/schema.sql
pnpm seed
```
Use a **pooled** connection string for serverless (transaction pooler, port 6543 on most providers) and
set `prepare: false` in the `postgres` client options — prepared statements break under a transaction
pooler. This is the single most common deploy failure; it is already handled in `lib/db/client.ts`, do
not remove it.

Migrations are a single idempotent `schema.sql` using `CREATE TABLE IF NOT EXISTS` and
`DO $$ … EXCEPTION WHEN duplicate_object` blocks for the enums. There is no migration tool; this is a
prototype with one schema version.

## 5. Production build

```bash
pnpm build     # next build, runs check-boundaries + typecheck first
pnpm start     # local production check on :3000
```
The build fails on: TypeScript errors, boundary violations, bundle budget overrun, missing
`.env.example` keys.

## 6. Deploy to Vercel

1. Push to GitHub.
2. Import the repo in Vercel. Framework preset: Next.js. Build command `pnpm build`, install `pnpm install`.
3. Add the environment variables from §3.
4. Deploy.
5. **Seed production:** `curl -X POST https://<domain>/api/demo/seed -H 'content-type: application/json' -d '{"caseNo":1}'`
   for each of 1, 2, 3 — or run `pnpm seed` locally against the production `DATABASE_URL`.
6. Verify: open `https://<domain>/api/health` → expect
   `{"ok":true,"aiMode":"model","store":"postgres","seeded":true}`.
7. Walk Case 1 end to end on a phone on mobile data. This is the acceptance gate, not the build log.

**Region:** deploy in a region near your database (e.g. `bom1` with a Mumbai database) or latency will
show up in the demo. Set `export const runtime = 'nodejs'` on routes that touch Postgres or the OpenAI SDK.

**No auth wall:** do not enable Vercel Deployment Protection on production. A password-protected
deployment fails the "judge opens it in a browser" requirement. Check this explicitly before submitting.

## 7. Submission checklist

- [ ] Public URL loads with no login, no password, no waitlist.
- [ ] `/demo` present and all three cases complete.
- [ ] Disclosure strip visible on every page.
- [ ] `/about` lists what is simulated, what is inferred, what would need real integration.
- [ ] `/api/health` returns `seeded: true`.
- [ ] Works with JS-heavy blockers off for the read-only screens.
- [ ] Tested on one real Android phone on mobile data, not just a device emulator.
- [ ] `docs/build-log.md` records what the coding agent generated.
- [ ] A 2-minute screen recording of Case 1 exists as a fallback if live demo networking fails.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `prepared statement "s1" already exists` | Transaction pooler + prepared statements | `prepare: false` in the postgres client |
| Cases vanish between requests | `DATABASE_URL` unset in that environment | Set it in Vercel, redeploy |
| Every case lands in band `LOW` | Seed not run, or extraction failing silently | Check `/api/health`; check for `AI_FALLBACK_USED` events |
| Screenshots never extract text | Model not vision-capable | Set `OPENAI_MODEL` to a vision-capable model |
| Intake times out | Two 5MB images + slow model | Lower the image cap, raise `OPENAI_TIMEOUT_MS`, or rely on fallback |
| `AI_UNAVAILABLE` in production only | Env var missing in Production scope (set only in Preview) | Re-add for Production |
| 429s during the demo | Rate limit too tight for a room on one network | Raise `RATE_LIMIT_PER_MIN` before a live demo |
| Hindi renders in a different font | Devanagari subset not loaded | Confirm `next/font` subsets include `devanagari` |
| Judge sees a Vercel login page | Deployment Protection on | Disable for production |

## 9. Rollback

Vercel keeps prior deployments. If a demo-day deploy misbehaves, promote the last known-good deployment
from the dashboard — do not debug live. Keep the last-good deployment URL written down before the demo.
