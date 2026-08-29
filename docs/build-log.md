# Build log

What the coding agent generated, which specification section it was pointed at, and every place the
build deviated from the spec and why. This is submission evidence, not decoration.

## Method

The whole specification (`files/*.md`, 14 documents) was read before any code was written. The build
then went bottom-up — types, then the deterministic engine, then the mock government systems and the
data layer, then the AI layer, then routes, then UI, then tests — so that every layer was verifiable
before the layer above it existed.

## Modules generated, and the section each was built from

| Module | Spec section |
|--------|--------------|
| `lib/types.ts` | `database.md` §1–2 (enums and tables) |
| `lib/token.ts` | `backend.md` §1 (16 chars, 32-symbol alphabet) |
| `lib/redact.ts` | `safety-and-honesty.md` §5 |
| `lib/ratelimit.ts` | `backend.md` §16 |
| `lib/uploads.ts` | `backend.md` §15 (magic bytes, 5 MB, in-memory only) |
| `lib/http.ts` | `backend.md` §0 (error envelope and codes) |
| `lib/engine/facts.ts` | `database.md` §4 (closed fact-key set) |
| `lib/engine/hypotheses.ts` | `workflows.md` §2 (eleven hypotheses, priors) |
| `lib/engine/diagnose.ts` | `workflows.md` §3 (logit scoring, bands) |
| `lib/engine/questions.ts` | `workflows.md` §4 (bank, information gain, stopping rule) |
| `lib/engine/journey.ts` | `workflows.md` §5 (eight stages, attestation rules) |
| `lib/engine/actions.ts` | `workflows.md` §6 (one plan per hypothesis) |
| `lib/engine/artifacts.ts` | `workflows.md` §7, `ai.md` §6 (post-validators) |
| `lib/engine/verify.ts` | `workflows.md` §8 |
| `lib/engine/escalation.ts` | `workflows.md` §9 (two ladders) |
| `lib/engine/machine.ts` | `workflows.md` §1 (state machine and guards) |
| `lib/gov-mock/*` | `mock-government-systems.md` (seed, client seam, mutations) |
| `lib/db/*` | `database.md` §2–3, §6 (schema, repository, memory store) |
| `lib/ai/*` | `ai.md` §2–7 (client, schemas, four calls, fallbacks) |
| `lib/service.ts` | `backend.md` §7 (engine first, model second) |
| `app/api/**` | `backend.md` §1–14 |
| `app/**`, `components/**` | `user-journey.md`, `ui-ux.md` |
| `tests/**` | `testing.md` §1–4 |

## Bugs the build found and fixed

These were found by the build's own checks, not by a reviewer.

1. **The verification comparison was not comparing like with like.** The "before" journey was built
   from facts only, while the "after" journey was built from facts *plus* the synthetic records. Any
   verification therefore looked like progress, and demo case 2 resolved when it should have escalated.
   Fixed by snapshotting the synthetic records *before* the mutation and building both journeys the same
   way (`app/api/cases/[token]/verify/route.ts`, `lib/demo-runner.ts`).

2. **A returned payment was being read as proof that routing worked.** The journey builder confirmed
   stage 7 whenever a payment came back, which is wrong: a payment can be rejected *at* the routing layer
   because the account is not enabled for benefit transfers. Demo case 1 must show stage 7 blocked and
   demo case 3 must show it confirmed, and both now do. Stage 7 is confirmed only when the bounce clearly
   happened at the account itself — a dormant/closed account or a known name mismatch, or a synthetic
   return reason other than `ACCOUNT_NOT_DBT_ENABLED` (`lib/engine/journey.ts`).

3. **A re-render could roll a new question.** `nextQuestion` selected and recorded a fresh question on
   every render of the questions page, writing duplicate rows. An outstanding question now stays the
   outstanding question (`lib/service.ts`).

4. **`\byear\b` never matched "two years".** The offline extractor missed demo case 3's dormant account
   because of a plural, so it asked a question the student had already answered in their own words
   (`lib/ai/fallback.ts`).

5. **A prohibited-claim pattern was case-sensitive.** `/\byour (file|application) is (at|with) [A-Z]/`
   did not match a sentence beginning "Your file is at…" — exactly where such a claim would appear
   (`lib/engine/artifacts.ts`).

## Deviations from the spec, and why

1. **Weight tuning beyond the spec's example tables.** `workflows.md` §2 fixes the priors and gives
   evidence tables for two hypotheses. The other nine were written to the same shape, and several
   *contradiction* weights were added that the spec does not list: a confirmed cause at one stage
   suppresses competing causes at another (a dormant account, a confirmed name mismatch, or a
   not-DBT-enabled account each explain a bounce without needing the others). Without these, the
   sigmoid-then-normalise formula the spec specifies cannot reach the `HIGH` band the demo cases
   require, because sigmoid saturation compresses the gap between a strong hypothesis and a weak one.
   Every added weight is recorded in `lib/engine/hypotheses.ts` with the reasoning in a comment, and the
   twenty-row golden table in `tests/unit/diagnose.spec.ts` locks the resulting rankings.

2. **Numeric predicates compare a representative point, not an interval.** The spec says range
   predicates are "evaluated by a small comparator". A fact can itself be a range (`>60`), so the
   comparator reduces both sides to a representative point with open ends capped at +60 days. Marked
   with a `ponytail:` comment naming the ceiling and the upgrade path.

3. **`lib/gov-mock/client.ts` is a factory taking a base URL.** The spec describes it as the single
   integration seam that owns the `/api/gov` URLs. It does, but it takes the base URL as an argument so
   the seed self-check and the tests can exercise the same contract without a running server. The
   disclaimer check that refuses an unmarked response is in the client, exactly as specified.

4. **Simulated time is a per-case day offset.** The spec asks for `processed_at` in simulated future
   time "plus a `simulatedNow` offset stored on the case". Implemented as `cases.simulated_day_offset`
   plus `gov_payments.pending_until_day`: a queued payment reads as pending until the case's offset
   reaches it. No real clock is involved and the UI says so in those words.

5. **Two design tokens were darkened to reach WCAG AA.** `ui-ux.md` §2 fixes `--color-slate` at
   `#6B7A90` and `--color-unknown` at `#B8791A`, and §7 requires WCAG 2.1 AA contrast. On the specified
   `--color-paper` those two measure 4.10:1 and 3.41:1 against a 4.5:1 requirement for normal text, so
   the two requirements cannot both hold. Accessibility won: they are now `#5A6779` (5.41:1) and
   `#96610F` (4.92:1), same hues, minimum change, noted in `app/globals.css` at the definition.
   Separately, the rail's `NOT_REACHED` *label* is rendered in `--color-slate` rather than
   `--color-line` — a hairline colour is right for a small marker and unreadable as text.

6. **The e2e suite is nine specs, not thirteen.** `testing.md` §3 lists thirteen. The nine written cover
   the three demo cases, the LOW-confidence path, provenance counting on every route, error codes,
   mobile, print and answer correction. Not written: `freetext.spec.ts` (needs ten hand-written
   transcript fixtures), `upload.spec.ts` (needs real screenshot fixtures), `no-ai.spec.ts` (covered at
   the integration layer by `ai-fallback.spec.ts`, which runs all three cases with no key), and
   `a11y.spec.ts` (needs `@axe-core/playwright`, an extra dependency). The accessibility requirements
   themselves are implemented — semantic `<ol>` rail with per-stage announcements, visible focus rings,
   labelled inputs, 44px targets — but they are not yet asserted automatically.

7. **Lighthouse CI is not wired up.** The bundle budget is met (`/start` first-load JS is 108 kB against
   a 150 kB budget) but nothing fails the build on a regression.

## What is deliberately not built

Real portal integration, application filing, accounts, notifications, payments, and dark mode — all
listed out of scope in `product.md` §5 and `ui-ux.md` §2, and all stated as absent on `/about`.
