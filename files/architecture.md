# Architecture

## 1. Stack (fixed — do not substitute)

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 15, App Router, React 19, TypeScript strict** | One deployable unit, server routes and UI together, trivial Vercel deploy |
| Styling | **Tailwind CSS v4** + CSS custom properties from `ui-ux.md` | No component library to fight |
| Validation | **Zod** | One schema source for API + AI structured outputs |
| Database | **Postgres** via `postgres` (porsager), with an **in-memory fallback store** | Works with a hosted Postgres URL; works with nothing at all for a demo |
| AI | **OpenAI Node SDK**, Responses API with JSON Schema structured outputs | Enforced output shape, no free-form parsing |
| Tests | **Vitest** (unit/integration) + **Playwright** (e2e, a11y) | Fast, headless, CI-friendly |
| Deploy | **Vercel** | Public URL, no auth wall |

No auth library. No state library — server state lives in the DB, client state is React `useState` plus
URL. No ORM.

## 2. Module boundaries (the important part)

```
                 ┌──────────────────────────────────────────┐
  Browser  ────► │  app/  (RSC pages + route handlers)       │
                 └───────────────┬──────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────────┐
        ▼                        ▼                            ▼
  lib/ai/*                 lib/engine/*                 lib/gov-mock/*
  "reads and writes         "decides"                   "pretends to be
   language"                                             other systems"
  - extract facts          - rules + hypotheses         - NSP-like status
  - pick question wording  - confidence bands           - PFMS-like payment
  - explain in plain words - action plans               - NPCI-like routing
  - draft artifacts        - state machine              - bank account state
  NEVER decides state      - verification logic         Deterministic, seeded
        │                        │                            │
        └────────────────────────┼────────────────────────────┘
                                 ▼
                            lib/db/*  (repository; Postgres or memory)
```

**Hard rule:** `lib/engine` must not import `lib/ai`. The engine is pure and synchronously testable.
The AI layer produces *inputs* (structured facts) and *renderings* (words), never decisions. Enforce with
an ESLint `no-restricted-imports` rule and a unit test that fails if `lib/engine` imports `openai`.

## 3. Folder structure

```
scholarship-saathi/
├── app/
│   ├── layout.tsx                    # DisclosureStrip, fonts, FallbackBanner
│   ├── page.tsx                      # landing
│   ├── globals.css                   # @theme tokens
│   ├── start/page.tsx
│   ├── demo/page.tsx
│   ├── about/page.tsx
│   ├── case/[token]/
│   │   ├── layout.tsx                # loads case, provides CaseContext, CopyLinkRow
│   │   ├── page.tsx                  # understanding / "What we understood"
│   │   ├── questions/page.tsx
│   │   ├── diagnosis/page.tsx
│   │   ├── actions/page.tsx
│   │   ├── artifact/[artifactId]/page.tsx
│   │   ├── verify/page.tsx
│   │   └── timeline/page.tsx
│   └── api/
│       ├── cases/route.ts                              # POST create
│       ├── cases/[token]/route.ts                      # GET case
│       ├── cases/[token]/intake/route.ts               # POST text/status/files
│       ├── cases/[token]/facts/route.ts                # PATCH edit a fact
│       ├── cases/[token]/questions/route.ts            # GET next question
│       ├── cases/[token]/answers/route.ts              # POST answer
│       ├── cases/[token]/diagnose/route.ts             # POST run diagnosis
│       ├── cases/[token]/actions/[actionId]/complete/route.ts
│       ├── cases/[token]/artifacts/route.ts            # POST generate
│       ├── cases/[token]/artifacts/[artifactId]/route.ts # GET / PATCH
│       ├── cases/[token]/verify/route.ts               # POST verification outcome
│       ├── cases/[token]/escalate/route.ts             # POST advance ladder
│       ├── demo/seed/route.ts                          # POST seed a demo case
│       ├── health/route.ts
│       └── gov/                                        # MOCK government services
│           ├── nsp/application/route.ts
│           ├── pfms/payment/route.ts
│           ├── npci/mapper/route.ts
│           └── bank/account/route.ts
├── components/            # see ui-ux.md §4
├── lib/
│   ├── ai/
│   │   ├── client.ts        # OpenAI client + availability probe + timeout wrapper
│   │   ├── schemas.ts       # Zod schemas -> JSON Schema for structured outputs
│   │   ├── extract.ts       # text + image -> CaseFacts
│   │   ├── question.ts      # phrase/order the engine's candidate questions
│   │   ├── explain.ts       # hypothesis -> plain-language verdict + why
│   │   ├── draft.ts         # artifact drafting
│   │   └── fallback.ts      # deterministic equivalents of all of the above
│   ├── engine/
│   │   ├── facts.ts         # CaseFacts type + merge + provenance
│   │   ├── hypotheses.ts    # the 11 failure states + evidence weights
│   │   ├── diagnose.ts      # scoring, ranking, confidence bands
│   │   ├── questions.ts     # question bank + information-gain selection
│   │   ├── actions.ts       # hypothesis -> action plan
│   │   ├── journey.ts       # facts + hypothesis -> 8-stage rail
│   │   ├── verify.ts        # verification outcome -> new state
│   │   ├── escalation.ts    # ladder
│   │   └── machine.ts       # case state machine + guards
│   ├── gov-mock/
│   │   ├── seed.ts          # synthetic records
│   │   ├── nsp.ts  pfms.ts  npci.ts  bank.ts
│   │   └── mutate.ts        # applies simulated real-world actions to records
│   ├── db/
│   │   ├── client.ts        # postgres.js or MemoryStore
│   │   ├── schema.sql
│   │   ├── repo.ts          # typed repository functions
│   │   └── memory.ts
│   ├── redact.ts            # Aadhaar/account/OTP scrubbing
│   ├── ratelimit.ts
│   ├── token.ts             # case token generation
│   └── log.ts
├── scripts/
│   ├── seed.ts
│   └── check-boundaries.ts
├── tests/
│   ├── unit/  integration/  e2e/  fixtures/
└── docs/                    # this folder
```

## 4. Request flow (intake example)

```
POST /api/cases/{token}/intake  (multipart)
  ├─ redact() text fields                              lib/redact
  ├─ rate limit by IP                                  lib/ratelimit
  ├─ for each image: bytes -> data URL (in memory)
  ├─ ai.extract(text, statusText, images)              lib/ai/extract  ─┐ 12s timeout
  │     └─ on failure/absence -> fallback.extract()    lib/ai/fallback ─┘
  ├─ facts.merge(existing, extracted)                  lib/engine/facts
  ├─ persist facts + evidence(text only) + events      lib/db/repo
  ├─ engine.questions.next(facts)                      lib/engine/questions
  ├─ machine.transition(case, 'EXTRACTED')             lib/engine/machine
  └─ 200 {case, facts, nextQuestion}
```

Images are held in memory for the duration of the request and never written to disk or DB.

## 5. State management

- Server is authoritative. Every page is a Server Component that fetches the case via `repo`.
- Mutations are `POST` route handlers called from client components with `fetch`, followed by
  `router.refresh()`. No optimistic UI except the checkbox tick.
- Client-only state: `localStorage.saathi_cases` (list of case tokens for "your cases"), the current
  question index, and upload previews.

## 6. Environment variables

```bash
# .env.example
OPENAI_API_KEY=              # optional. Unset => deterministic fallback mode.
OPENAI_MODEL=gpt-4.1-mini    # must be vision-capable for screenshot reading
OPENAI_TIMEOUT_MS=12000
DATABASE_URL=                # optional Postgres URL. Unset => in-memory store.
APP_BASE_URL=http://localhost:3000
RATE_LIMIT_PER_MIN=30
DEMO_MODE_ONLY=false         # true => /start disabled, only seeded demo cases (safe public demo)
LOG_LEVEL=info
```

`OPENAI_API_KEY` is server-only and must never be referenced in a client component. Add a build-time
check in `scripts/check-boundaries.ts`.

## 7. Failure posture

| Dependency | If it fails | User sees |
|-----------|-------------|-----------|
| OpenAI | Fallback deterministic extraction/templates | Amber banner, journey still completes |
| Postgres | Falls back to in-memory store at boot (logged) | Nothing; cases don't survive restarts |
| Mock gov service | Returns `UNKNOWN` status | Rail stage renders `Unknown` with "we couldn't check" note |
| Upload parse | Skip that file | "We couldn't read text in that image" + paste option |

The app must never show a blank screen or a stack trace. `app/error.tsx` and `app/not-found.tsx` are
required.

## 8. Security practices (proportionate to a prototype)

- No authentication, therefore no personal data: enforce by refusing to persist anything matching
  Aadhaar/account/OTP patterns (`lib/redact.ts`), applied server-side on every write path.
- Case tokens: 16 chars from a 32-symbol alphabet (~80 bits) — unguessable, not secret. Say so on screen.
- All input validated with Zod at the route boundary; reject unknown keys.
- File uploads: extension + magic-byte check, 5 MB cap, 3 files, images only.
- Rate limit per IP per route group; 429 with `Retry-After`.
- CSP header: `default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'`.
- No third-party analytics, no cookies, no trackers. State this on `/about`.
