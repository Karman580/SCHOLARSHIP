# Scholarship Saathi

A student's scholarship shows **sanctioned**. The money has not arrived. The portal's status stops at
sanction, and the failure — if there is one — happened in a payment system, a routing layer or a bank
that the student cannot see and the portal does not report on.

This app works out **which stage is actually blocked**, says honestly what it cannot tell, gives one
concrete thing to do this week, and drafts the letter, grievance or RTI to send.

It is an **independent prototype**. It connects to **no** live government, banking, Aadhaar, PFMS or
NPCI system. Every government record in it is synthetic and labelled as such on screen.

## Quickstart

```bash
npm install
cp .env.example .env.local     # every value is optional
npm run db:push                # no-op without DATABASE_URL -> in-memory store
npm run seed                   # loads synthetic records and self-checks all three demo cases
npm run dev                    # http://localhost:3000
npm test && npm run test:e2e
```

`npm run seed` ends with a headless run of the whole engine against the seeded records:

```
Seeded 3 demo applications — all records are synthetic.
Self-check: case 1 -> RESOLVED, case 2 -> ESCALATED, case 3 -> RESOLVED. OK
```

If that self-check fails, the build is not deployable — it catches a broken diagnosis before a judge does.

## How it is put together

```
app/            RSC pages and route handlers
components/     UI, including the JourneyRail and the required ProvenanceBadge
lib/ai/         reads and writes language. Never decides anything.
lib/engine/     decides. Pure, synchronous, and it may not import lib/ai.
lib/gov-mock/   four synthetic services shaped like the real ones
lib/db/         one repository interface, Postgres or in-memory behind it
```

Three rules hold the design together:

1. **The model never invents a government state.** It extracts facts from messy text and screenshots,
   rewords questions the engine already chose, explains the engine's verdict, and drafts letters. A
   deterministic rules engine decides the state, the ranking and the confidence. `lib/engine` importing
   `lib/ai` fails the build.
2. **Every fact on screen carries its provenance** — `Public rule`, `Demo record`, `You told us`,
   `Our estimate`. It is a required prop, not a decoration: a component that renders a value without one
   does not typecheck.
3. **Uploaded images are never stored.** They live in memory for one request. Only the extracted,
   redacted text is persisted. There is no file storage in this application.

## It works with nothing configured

| Missing | What happens |
|---------|--------------|
| No AI key | Deterministic extraction and templates. An amber banner says so. All three demo cases still complete. |
| No database | An in-memory store with the identical repository contract. Cases do not survive a restart. |
| Both | The whole journey still runs end to end. |

## Documentation

- `docs/build-log.md` — what was generated from which spec section, the bugs the build found, and every
  deviation from the specification with its reason.
- `docs/licences.md` — fonts and dependencies.
- `files/` — the specification this was built from.

## Honesty

There is no verified national statistic for how many scholarship payments fail at the Aadhaar-seeding or
payment-routing stage, and the app says so on `/about` rather than inventing one. The probability weights
are product judgement, not measured frequencies, and it says that too. It diagnoses and drafts. It does
not move money, and it never pretends to.
