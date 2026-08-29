# Backend API

All routes are Next.js route handlers under `app/api`. All bodies are JSON except intake (multipart).
All inputs are validated with Zod; unknown keys are rejected with `400 VALIDATION_ERROR`.

## 0. Conventions

**Success:** `200` with the resource. **Error:** non-2xx with

```json
{ "error": { "code": "CASE_NOT_FOUND", "message": "human readable", "retryable": false } }
```

Error codes: `VALIDATION_ERROR`, `CASE_NOT_FOUND`, `INVALID_STATE`, `UPLOAD_TOO_LARGE`,
`UPLOAD_UNSUPPORTED`, `UPLOAD_UNREADABLE`, `AI_UNAVAILABLE` (never fatal — see §3), `RATE_LIMITED`,
`SERVER_ERROR`.

Every mutating route: rate-limited, redacts all text input, appends an `events` row, returns the updated
case envelope:

```ts
type CaseEnvelope = {
  case: { token, state, isDemo, demoCaseNo, language, aiMode, createdAt, updatedAt };
  facts: { key, value, provenance, confidence }[];
  journey?: JourneyStage[];
  nextQuestion?: Question | null;
  diagnosis?: DiagnosisView | null;
  actions?: ActionView[];
  artifacts?: ArtifactSummary[];
}
```

---

## 1. `POST /api/cases`

Create an empty case.

**Body:** `{ language?: 'en'|'hi', isDemo?: boolean, demoCaseNo?: 1|2|3 }`
**Response 201:** `{ token, state: 'NEW' }`

Side effects: generate token (`lib/token.ts`, 16 chars, alphabet `23456789abcdefghjkmnpqrstuvwxyz`),
insert case, event `CASE_CREATED`, lazy retention sweep.

If `DEMO_MODE_ONLY=true` and `isDemo` is not true → `403 INVALID_STATE`.

---

## 2. `GET /api/cases/{token}`

**Response 200:** full `CaseEnvelope` (facts, latest diagnosis, actions, artifacts, journey).
**404 `CASE_NOT_FOUND`** if unknown token. Never leak whether a token *ever* existed.

---

## 3. `POST /api/cases/{token}/intake`

`multipart/form-data`.

| Field | Type | Rules |
|-------|------|-------|
| `description` | text | 0–4000 chars |
| `statusText` | text | 0–2000 chars |
| `schemeType` | text | one of the enum or omitted |
| `academicYear` | text | `YYYY-YY` or omitted |
| `portal` | text | `NATIONAL`\|`STATE`\|`UNKNOWN` |
| `files` | file[] | ≤3 files, ≤5 MB each, `image/jpeg png webp`, magic-byte verified |

At least one of `description`, `statusText`, `files` must be non-empty → else `400 VALIDATION_ERROR`.

**Pipeline** (see `architecture.md` §4):
1. Redact all text (`lib/redact.ts`). Store redacted text as `evidence` rows.
2. Convert each image to a base64 data URL **in memory**. Never write to disk. Never persist bytes.
3. `ai.extract()` with a 12s timeout; on any failure or missing key → `fallback.extract()` and set
   `case.ai_mode='fallback'`, event `AI_FALLBACK_USED`.
4. Persist extracted text per image as `evidence(kind='SCREENSHOT_TEXT')`.
5. `facts.merge()` — user-typed values always beat model values; model values never overwrite a
   `USER_STATED` fact.
6. Transition `INTAKE → EXTRACTED`; compute `nextQuestion`.

**Response 200:** `CaseEnvelope` with `facts`, `nextQuestion`, and `unreadableFiles: string[]`.

---

## 4. `PATCH /api/cases/{token}/facts`

Edit a single extracted fact from the "What we understood" card.

**Body:** `{ key: FactKey, value: string | null }`
Effects: supersede the old fact, insert new with `provenance='USER_STATED'`, event `FACT_EDITED`,
invalidate any answers whose question the new fact resolves, recompute `nextQuestion`.
**Response 200:** `CaseEnvelope`.

---

## 5. `GET /api/cases/{token}/questions`

**Response 200:** `{ nextQuestion: Question | null, askedCount: number, expectedRemaining: number }`

```ts
type Question = {
  id: string;                 // question bank key
  prompt: string;             // AI-phrased or template
  why: string;                // "This separates X from Y"
  options: { id: string; label: string }[];   // 2–4
  allowDontKnow: true;
  howToCheck?: { steps: string[]; provenance: 'PUBLIC_RULE' };
};
```

`nextQuestion: null` means the engine's stopping rule fired → client redirects to diagnosis.

---

## 6. `POST /api/cases/{token}/answers`

**Body:** `{ questionId: string, answer: string }` where `answer` is an option id, `DONT_KNOW`, or `SKIPPED`.

Effects: record answer; derive facts from the answer map (deterministic, in `lib/engine/questions.ts`);
re-run selection. If the stopping rule fires, also run diagnosis inline and transition to `DIAGNOSED`.

**Response 200:** `{ nextQuestion: Question | null, case, facts }`
**409 `INVALID_STATE`** if `questionId` is not the current outstanding question.

---

## 7. `POST /api/cases/{token}/diagnose`

Idempotent: re-runs the engine on current facts and stores a new `diagnoses` row.

**Response 200:**
```ts
{
  diagnosis: {
    id, band: 'HIGH'|'MEDIUM'|'LOW',
    verdictText: string,                          // plain sentence
    top: { hypothesisId, label, confidence },
    ranked: { hypothesisId, label, confidence, why: string[], disproveBy: string[] }[],
    known: { text, provenance }[],
    unknown: { text, howToFindOut: string }[],    // never empty
    journey: JourneyStage[]
  },
  actions: ActionView[],                          // issued immediately
  case
}
```

Engine first, model second: `lib/engine/diagnose.ts` produces the ranking, `lib/ai/explain.ts` only turns
the top hypothesis + evidence into `verdictText` and the `why` bullets. If the model is unavailable,
`fallback.explain()` composes from templates. **The ranking is identical either way** — assert this in
tests.

---

## 8. `POST /api/cases/{token}/actions/{actionId}/complete`

**Body:** `{ outcome?: string }` (an outcome id from the action's outcome set)
Effects: set `completed_at`, event `ACTION_COMPLETED`; if all required actions complete, transition
`ACTION_PLANNED → AWAITING_VERIFICATION`.
**Response 200:** `CaseEnvelope`.

---

## 9. `POST /api/cases/{token}/artifacts`

**Body:** `{ type: ArtifactType, language?: 'en'|'hi', actionId?: string }`

Effects: gather case facts + diagnosis + escalation rung → `ai.draft()` (or `fallback.draft()` templates)
→ validate against the artifact schema (must contain the disclaimer line, must not contain any
`[[unfilled]]` count > 6, must not contain claims from the prohibited list in `safety-and-honesty.md` §4)
→ persist.

**Response 201:** `{ artifact: { id, type, recipient, subject, body, placeholders, generatedBy } }`

`GET /api/cases/{token}/artifacts/{artifactId}` → the artifact.
`PATCH …/{artifactId}` with `{ body }` → saves the student's edits, sets `edited=true`.

---

## 10. `POST /api/cases/{token}/verify`

The heart of the "does it actually resolve" requirement.

**Body:** `{ actionId: string, outcome: string, note?: string }`

Pipeline:
1. Map `outcome` → `MockAction` (table in `mock-government-systems.md` §5).
2. `repo.gov.applyRealWorldAction()` mutates the synthetic records (e.g. `BANK_SEEDED_DBT` sets
   `gov_bank_accounts.dbt_enabled=true` and schedules `gov_payments.status='PROCESSED'` with a UTR dated
   +2 days), event `GOV_RECORD_CHANGED` actor `DEMO_GOV`.
3. Re-query the four mock services.
4. `lib/engine/verify.ts` compares old vs new journey → returns one of
   `RESOLVED | PROGRESSED | NO_CHANGE | NEEDS_MORE_INFO`.
5. Transition case state accordingly; if `PROGRESSED`, issue the next action set; if `NO_CHANGE`, issue
   the escalation option.

**Response 200:**
```ts
{
  result: 'RESOLVED'|'PROGRESSED'|'NO_CHANGE'|'NEEDS_MORE_INFO',
  journey: JourneyStage[],           // every stage carries provenance 'SIMULATED' where it came from mocks
  creditSimulated?: { amountPaise, dateIso, accountMasked },   // only on RESOLVED
  nextActions?: ActionView[],
  escalation?: { currentRung, nextRung, artifactType },
  case
}
```

Every field sourced from the mock services is tagged `SIMULATED` and the UI must render the
`Demo record` badge. There is no code path that reports a real-world payment.

---

## 11. `POST /api/cases/{token}/escalate`

**Body:** `{ toRung?: string }` (defaults to the next rung from `lib/engine/escalation.ts`)
Effects: insert `escalations` row, generate the rung's artifact, transition to `ESCALATED`,
event `ESCALATED`.
**Response 200:** `{ escalation, artifact, case }`

---

## 12. `POST /api/demo/seed`

**Body:** `{ caseNo: 1|2|3 }`
Effects: ensure `gov_*` seed rows exist for that case (idempotent, resets that case's records to their
initial state), create a case with `is_demo=true`, insert the demo intake text as evidence, run the
normal intake pipeline (model or fallback), return the token.
**Response 201:** `{ token }`

---

## 13. Mock government endpoints (`/api/gov/*`)

These exist so the frontend and engine talk to "external systems" over HTTP exactly as they would in
production, which is what makes the end-to-end architecture real rather than theoretical. Each response
carries `"simulated": true` and a `X-Saathi-Simulated: true` header.

| Route | Query | Returns |
|-------|-------|---------|
| `GET /api/gov/nsp/application` | `applicationId` | `{simulated, applicationId, scheme, academicYear, portalStatusText, statusCode, instituteVerifiedAt, stateVerifiedAt, sanctionedAt, amountPaise}` |
| `GET /api/gov/pfms/payment` | `applicationId` | `{simulated, paymentId, status, processedAt, returnReason, utr}` |
| `GET /api/gov/npci/mapper` | `aliasKey` | `{simulated, mappedBank, dbtEnabled, lastUpdated}` |
| `GET /api/gov/bank/account` | `bankRefId` | `{simulated, bankName, accountMasked, accountStatus, nameOnAccount, aadhaarSeeded, dbtEnabled}` |

Unknown ids return `200 {simulated: true, found: false}` — not 404 — because the real-world analogue of
"no record" is itself a diagnostic signal.

Each route file starts with the comment:
```ts
// SIMULATED SERVICE. This is not a government API. No live system is contacted.
```

---

## 14. `GET /api/health`

`{ ok: true, aiMode: 'model'|'fallback', store: 'postgres'|'memory', engineVersion, seeded: boolean }`

---

## 15. Uploads — the rules

1. Read with `request.formData()`; reject > 5 MB before buffering more (check `file.size`).
2. Verify magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF….WEBP`. Extension alone is not trusted.
3. Convert to `data:image/…;base64,…` in memory, pass to the model, then let it go out of scope.
4. Persist only the extracted, redacted **text**.
5. Never write to `/tmp`, never to object storage, never to the DB. There is no file storage in this app —
   say so in `/about`.

## 16. Rate limiting

Token bucket in memory keyed by `x-forwarded-for` (first hop): 30 req/min default, 6/min for
`intake`, `diagnose`, `artifacts` (the model-calling routes). Exceeding → `429 RATE_LIMITED` with
`Retry-After`. In-memory is acceptable for a prototype; note the limitation in `/about`.

## 17. Logging

Structured JSON to stdout: `{ts, level, route, caseToken, event, durationMs, aiMode}`.
**Never log:** request bodies, extracted text, artifact bodies, image data. Log lengths, not contents.
