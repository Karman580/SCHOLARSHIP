# Testing

`pnpm test` (Vitest) must pass before any deploy. `pnpm test:e2e` (Playwright) must pass on Chromium
desktop **and** the Pixel 5 device profile.

## 1. Unit tests (`tests/unit/`)

| File | Asserts |
|------|---------|
| `machine.spec.ts` | Every legal transition succeeds; every illegal pair throws `InvalidTransition`; `RESOLVED` unreachable without a `VERIFYING` run whose stage 8 is `CONFIRMED` |
| `diagnose.spec.ts` | 20-row golden table of fact-sets → expected top hypothesis + band. Includes: all-UNKNOWN → `LOW`; contradicting facts → correct suppression; `requires` gates zero out the hypothesis |
| `questions.spec.ts` | Selection picks max information gain; never repeats an asked question; stops at 5; stops when `maxGain < 0.02`; `DONT_KNOW` writes `UNKNOWN` and contributes nothing |
| `journey.spec.ts` | No stage is `CONFIRMED` without attestation; band `LOW` produces zero `BLOCKED` stages; stages after the blocker are `NOT_REACHED` |
| `verify.spec.ts` | Each outcome→mutation→result mapping; `NOTHING_HAPPENED` yields `NO_CHANGE` |
| `facts.spec.ts` | `USER_STATED` never overwritten by `AI_INFERENCE`; superseding keeps history; unknown keys dropped |
| `redact.spec.ts` | 12-digit, 9–18-digit and 6-digit patterns removed from text, from pasted status, and from screenshot-extracted text; a 10-digit phone number is preserved (it is not an identifier we block) — verify the boundary cases explicitly |
| `boundaries.spec.ts` | `lib/engine/**` imports nothing from `lib/ai/**` or `openai`; no client component imports `OPENAI_API_KEY` |
| `escalation.spec.ts` | Correct ladder chosen per hypothesis; rungs advance in order; dates recorded |
| `artifact-validators.spec.ts` | Each prohibited pattern from `ai.md` §6 is rejected; missing closing line rejected; ≥9-digit number rejected; >6 placeholders rejected |

## 2. Integration tests (`tests/integration/`)

Run twice: once with `DATABASE_URL` set (Postgres in CI service container), once unset (memory store).

| File | Asserts |
|------|---------|
| `repo.spec.ts` | Full repository contract passes against both stores identically |
| `intake.spec.ts` | Multipart intake with text only, text + status, text + image; oversized file → `UPLOAD_TOO_LARGE`; non-image magic bytes → `UPLOAD_UNSUPPORTED`; **no image bytes present anywhere in the DB after intake** (scan all text columns) |
| `ai-fallback.spec.ts` | With `OPENAI_API_KEY` unset: all three demo cases reach the same **ranking** as with a stubbed model; `ai_mode='fallback'`; `AI_FALLBACK_USED` event written |
| `ai-stub.spec.ts` | Model stubbed to return malformed JSON, an unknown fact key, a prohibited claim, and a timeout — each falls back cleanly with no 500 |
| `gov-mock.spec.ts` | Every `/api/gov/*` response includes `simulated:true` and the disclaimer; unknown id → `found:false` with 200; client throws if `disclaimer` is missing |
| `mutations.spec.ts` | Each `MockAction` produces exactly the documented record changes; seed is idempotent |
| `ratelimit.spec.ts` | 429 with `Retry-After` after the configured burst |

## 3. End-to-end tests (`tests/e2e/`)

| File | Scenario |
|------|----------|
| `demo-case-1.spec.ts` | Full Case 1 path → `RESOLVED`; asserts extraction does **not** set `dbt_enabled_reported=YES` from "aadhaar link hai"; asserts stage 7 is the only `BLOCKED` |
| `demo-case-2.spec.ts` | Full Case 2 path → `ESCALATED` after two rungs; asserts no desk/officer-location phrase appears in verdict or artifacts |
| `demo-case-3.spec.ts` | Both branches (name different / name same) → `RESOLVED`; asserts runner-up hypothesis is rendered expanded |
| `freetext.spec.ts` | Ten messy transcripts (fixtures) → at least 8 land the correct hypothesis in the top 3; the other 2 must land band `LOW` with a sensible separating question, **not** a confident wrong answer |
| `low-confidence.spec.ts` | An input with almost no information → band `LOW`, two possibilities side by side, action = one information-gathering step, no `BLOCKED` stage |
| `upload.spec.ts` | Screenshot upload happy path; unreadable image → `UPLOAD_UNREADABLE` + paste fallback offered |
| `wrong-answers.spec.ts` | Answering a question, going back, changing it → later answers invalidated, ranking recomputed, no stale diagnosis shown |
| `provenance.spec.ts` | On every route: rendered fact rows === rendered provenance badges; no `SIMULATED` value without a `Demo record` badge |
| `no-ai.spec.ts` | With the key unset: all three demo cases complete; fallback banner visible on every screen |
| `errors.spec.ts` | Each error code renders its component with a working recovery action; no stack trace ever reaches the DOM |
| `mobile.spec.ts` | Pixel 5 profile: no horizontal scroll at 320px; sticky CTA visible and tappable; question buttons ≥ 56px |
| `a11y.spec.ts` | `@axe-core/playwright` on `/`, `/start`, `/case/x`, `/case/x/questions`, `/case/x/diagnosis`, `/case/x/actions`, `/case/x/verify` — zero serious or critical violations; keyboard-only traversal of the full Case 1 journey |
| `print.spec.ts` | Artifact print stylesheet renders the body and the disclaimer, hides navigation |

## 4. Content and honesty tests (`tests/unit/content.spec.ts`)

Automated scan over all rendered strings, artifact templates and Hindi translation files:

- No occurrence of: "we checked", "we verified", "we confirmed", "we submitted", "we filed",
  "your file is at", "will be credited on", "guaranteed", "official government".
- The disclosure strip string appears in the root layout.
- Every artifact template ends with the exact closing line.
- Every `howToCheck` block is badged `PUBLIC_RULE`.
- The `/about` page contains the "no national failure statistic exists" sentence.

These are the tests that protect the honesty score. Treat a failure here as a release blocker, not a nit.

## 5. Performance checks

- Lighthouse CI on `/` and `/start`: performance ≥ 90 mobile, accessibility = 100.
- Bundle budget: intake route JS ≤ 150KB gzipped; fail the build if exceeded.
- Assert intake completes within 15s with two images against a stubbed model with a 2s delay.

## 6. Manual test matrix (run once before submitting)

| # | Test | Pass condition |
|---|------|----------------|
| 1 | Cold open on a phone over mobile data | Landing usable in < 3s |
| 2 | Type one sentence, nothing else | Reaches a diagnosis or an honest `LOW` with a next step |
| 3 | Paste an Aadhaar-shaped number | Removed, toast shown, not in the DB |
| 4 | Upload a photo of a laptop screen (glare, angle) | Text extracted or clean `UPLOAD_UNREADABLE` |
| 5 | Answer everything "I don't know" | Band `LOW`, still gives one useful step; never a confident verdict |
| 6 | Kill the network mid-question | Error state with retry; case intact on reload |
| 7 | Unset `OPENAI_API_KEY`, run all three demos | All complete; banner visible |
| 8 | Open a case link in a fresh browser | Loads without login |
| 9 | Switch an artifact to Hindi | Real Hindi, Devanagari renders in Plex, no font fallback |
| 10 | Print an artifact | Clean single page with the disclaimer |
| 11 | 200% zoom at 360px | No clipping, no horizontal scroll |
| 12 | Read the whole flow aloud to someone unfamiliar with scholarships | They can say what to do on Monday |

Test 12 is the real acceptance test. If they cannot repeat the next action in their own words, the copy
has failed regardless of what the automated suite says.
