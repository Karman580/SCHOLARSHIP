# Database

Postgres if `DATABASE_URL` is set, otherwise an in-memory store with the identical repository interface.
Both must pass the same repository test suite (`tests/integration/repo.spec.ts` runs twice).

## 1. Enums

```sql
CREATE TYPE case_state AS ENUM (
  'NEW','INTAKE','EXTRACTED','QUESTIONING','DIAGNOSED','ACTION_PLANNED',
  'AWAITING_VERIFICATION','VERIFYING','NEEDS_MORE_INFO','ESCALATED','RESOLVED','ABANDONED'
);

CREATE TYPE provenance AS ENUM ('PUBLIC_RULE','SIMULATED','USER_STATED','AI_INFERENCE');

CREATE TYPE evidence_kind AS ENUM ('FREE_TEXT','PASTED_STATUS','SCREENSHOT_TEXT','ANSWER','NOTE');

CREATE TYPE artifact_type AS ENUM (
  'BANK_DBT_REQUEST','BANK_REACTIVATION_REQUEST','INSTITUTE_FOLLOWUP',
  'PORTAL_GRIEVANCE','RTI_DRAFT','CASE_SUMMARY'
);

CREATE TYPE journey_status AS ENUM ('CONFIRMED','LIKELY','UNKNOWN','BLOCKED','NOT_REACHED');
```

## 2. Tables (`lib/db/schema.sql`)

```sql
CREATE TABLE cases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text UNIQUE NOT NULL,            -- 16-char URL token
  state          case_state NOT NULL DEFAULT 'NEW',
  is_demo        boolean NOT NULL DEFAULT false,
  demo_case_no   int,                              -- 1|2|3 when is_demo
  language       text NOT NULL DEFAULT 'en',       -- 'en' | 'hi'
  ai_mode        text NOT NULL DEFAULT 'model',    -- 'model' | 'fallback'
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON cases (created_at DESC);

-- One row per known fact. Never overwrite: supersede.
CREATE TABLE facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  key         text NOT NULL,                       -- see §4 fact keys
  value       text,                                -- normalised value or 'UNKNOWN'
  provenance  provenance NOT NULL,
  confidence  real,                                -- 0..1, only for AI_INFERENCE
  superseded  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON facts (case_id, key) WHERE superseded = false;

CREATE TABLE evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind          evidence_kind NOT NULL,
  content       text NOT NULL,                     -- REDACTED text only. Never image bytes.
  source_label  text,                              -- e.g. 'screenshot-1.png'
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions_asked (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  question_id  text NOT NULL,                      -- key from the question bank
  prompt_shown text NOT NULL,                      -- exact wording shown (may be AI-phrased)
  answer_value text,                               -- option id | 'DONT_KNOW' | 'SKIPPED'
  answered_at  timestamptz,
  seq          int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON questions_asked (case_id, seq);

CREATE TABLE diagnoses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  ranked         jsonb NOT NULL,     -- [{hypothesisId, score, confidence, why[], disproveBy[]}]
  top_hypothesis text NOT NULL,
  band           text NOT NULL,      -- 'HIGH'|'MEDIUM'|'LOW'
  known          jsonb NOT NULL,     -- [{text, provenance}]
  unknown        jsonb NOT NULL,     -- [{text, howToFindOut}]
  journey        jsonb NOT NULL,     -- [{stageId, status, provenance, note}]
  verdict_text   text NOT NULL,      -- plain-language sentence (AI or fallback)
  engine_version text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL,
  action_key   text NOT NULL,        -- from lib/engine/actions.ts
  seq          int NOT NULL,
  title        text NOT NULL,
  body         jsonb NOT NULL,       -- {doThis, where, takeWith[], expect, typicalTime}
  artifact_type artifact_type,
  completed_at timestamptz,
  outcome      text,                 -- outcome id recorded at verification
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON actions (case_id, seq);

CREATE TABLE artifacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type        artifact_type NOT NULL,
  language    text NOT NULL DEFAULT 'en',
  recipient   text NOT NULL,
  subject     text,
  body        text NOT NULL,
  placeholders jsonb NOT NULL DEFAULT '[]',   -- ["your name","enrolment number"]
  generated_by text NOT NULL,                 -- 'model' | 'template'
  edited      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type       text NOT NULL,          -- see §5
  actor      text NOT NULL,          -- 'USER' | 'SAATHI' | 'DEMO_GOV'
  summary    text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON events (case_id, created_at);

CREATE TABLE escalations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  rung        text NOT NULL,         -- 'INSTITUTE'|'STATE_NODAL'|'PORTAL_HELPDESK'|'MINISTRY'|'PUBLIC_GRIEVANCE'|'RTI'|'BANK_BRANCH'|'BANK_NODAL'|'BANK_OMBUDSMAN'
  reached_at  timestamptz NOT NULL DEFAULT now(),
  artifact_id uuid REFERENCES artifacts(id)
);
```

### Mock government tables (separate namespace, seeded, never mixed with case data)

```sql
CREATE TABLE gov_applications (           -- NSP-like
  application_id text PRIMARY KEY,        -- 'NSP-DEMO-1001'
  student_alias  text NOT NULL,           -- 'Priya K. (demo)'
  scheme         text NOT NULL,
  academic_year  text NOT NULL,
  amount_paise   bigint NOT NULL,
  institute_verified_at timestamptz,
  state_verified_at     timestamptz,
  sanctioned_at         timestamptz,
  portal_status_text    text NOT NULL,    -- what the fake portal shows
  bank_ref_id    text                     -- links to gov_bank_accounts
);

CREATE TABLE gov_payments (               -- PFMS-like
  payment_id     text PRIMARY KEY,
  application_id text NOT NULL REFERENCES gov_applications(application_id),
  status         text NOT NULL,           -- 'NO_RECORD'|'PENDING_AT_AGENCY'|'PROCESSED'|'RETURNED'
  processed_at   timestamptz,
  return_reason  text,                    -- 'ACCOUNT_NOT_DBT_ENABLED'|'NAME_MISMATCH'|'ACCOUNT_INACTIVE'|'ACCOUNT_CLOSED'|NULL
  utr            text
);

CREATE TABLE gov_aadhaar_mapping (        -- NPCI-mapper-like
  mapping_id     text PRIMARY KEY,
  alias_key      text NOT NULL,           -- synthetic id, NOT an Aadhaar number
  mapped_bank    text,
  dbt_enabled    boolean NOT NULL DEFAULT false,
  last_updated   timestamptz
);

CREATE TABLE gov_bank_accounts (
  bank_ref_id    text PRIMARY KEY,
  bank_name      text NOT NULL,
  account_masked text NOT NULL,           -- 'XXXXXX4417'
  account_status text NOT NULL,           -- 'ACTIVE'|'DORMANT'|'CLOSED'|'MIN_KYC_LIMIT'
  name_on_account text NOT NULL,
  aadhaar_seeded boolean NOT NULL DEFAULT false,
  dbt_enabled    boolean NOT NULL DEFAULT false
);
```

Every row in the `gov_*` tables is fictional. The seed script prints
`Seeded 3 demo applications — all records are synthetic` so it is obvious in logs.

## 3. Repository API (`lib/db/repo.ts`)

```ts
export interface Repo {
  createCase(input: {isDemo?: boolean; demoCaseNo?: number; language?: 'en'|'hi'}): Promise<Case>;
  getCaseByToken(token: string): Promise<CaseWithRelations | null>;
  setCaseState(caseId: string, state: CaseState): Promise<void>;
  setAiMode(caseId: string, mode: 'model'|'fallback'): Promise<void>;

  upsertFacts(caseId: string, facts: FactInput[]): Promise<void>;   // supersedes same key
  getFacts(caseId: string): Promise<Fact[]>;                        // non-superseded only

  addEvidence(caseId: string, e: EvidenceInput): Promise<void>;

  recordQuestion(caseId: string, q: {questionId: string; promptShown: string; seq: number}): Promise<string>;
  recordAnswer(caseId: string, questionId: string, answerValue: string): Promise<void>;
  getQuestions(caseId: string): Promise<QuestionAsked[]>;
  invalidateAnswersAfter(caseId: string, seq: number): Promise<void>;

  saveDiagnosis(caseId: string, d: DiagnosisInput): Promise<Diagnosis>;
  latestDiagnosis(caseId: string): Promise<Diagnosis | null>;

  saveActions(caseId: string, diagnosisId: string, actions: ActionInput[]): Promise<Action[]>;
  completeAction(caseId: string, actionId: string, outcome?: string): Promise<void>;
  getActions(caseId: string): Promise<Action[]>;

  saveArtifact(caseId: string, a: ArtifactInput): Promise<Artifact>;
  getArtifact(caseId: string, artifactId: string): Promise<Artifact | null>;
  updateArtifactBody(artifactId: string, body: string): Promise<void>;

  addEvent(caseId: string, e: EventInput): Promise<void>;
  getEvents(caseId: string): Promise<Event[]>;

  addEscalation(caseId: string, rung: string, artifactId?: string): Promise<void>;

  // mock government
  gov: {
    getApplication(id: string): Promise<GovApplication | null>;
    getPayment(applicationId: string): Promise<GovPayment | null>;
    getMapping(aliasKey: string): Promise<GovMapping | null>;
    getAccount(bankRefId: string): Promise<GovAccount | null>;
    applyRealWorldAction(input: {applicationId: string; action: MockAction}): Promise<void>;
  };
}
```

`MockAction` values: `BANK_SEEDED_DBT`, `ACCOUNT_REACTIVATED`, `NAME_CORRECTED`,
`NEW_ACCOUNT_PROVIDED`, `INSTITUTE_VERIFIED`, `PAYMENT_REPUSHED`, `NOTHING_HAPPENED`.

## 4. Fact keys (canonical, closed set)

`lib/engine/facts.ts` exports `FACT_KEYS` as a const tuple; both the AI schema and the DB use it.

| Key | Values | Notes |
|-----|--------|-------|
| `scheme_type` | `PRE_MATRIC` `POST_MATRIC` `MERIT_CUM_MEANS` `TOP_CLASS` `STATE_SCHEME` `UNKNOWN` | |
| `academic_year` | `YYYY-YY` \| `UNKNOWN` | |
| `portal` | `NATIONAL` `STATE` `UNKNOWN` | |
| `application_id` | string \| `UNKNOWN` | synthetic only |
| `portal_status_raw` | free text | as pasted/OCR'd |
| `portal_status_code` | `SUBMITTED` `DEFECTIVE` `INSTITUTE_PENDING` `STATE_PENDING` `SANCTIONED` `PAID` `REJECTED` `UNKNOWN` | normalised |
| `sanction_seen` | `YES` `NO` `UNKNOWN` | |
| `days_since_sanction` | integer \| `UNKNOWN` | |
| `institute_verified` | `YES` `NO` `UNKNOWN` | |
| `state_verified` | `YES` `NO` `UNKNOWN` | |
| `payment_system_result` | `NO_RECORD` `PENDING` `PROCESSED` `RETURNED` `UNKNOWN` | student-reported lookup |
| `bank_account_given` | `YES` `NO` `UNKNOWN` | |
| `account_status_reported` | `ACTIVE` `DORMANT` `CLOSED` `MIN_KYC` `UNKNOWN` | |
| `aadhaar_linked_to_account` | `YES` `NO` `UNKNOWN` | linked ≠ DBT-enabled; keep separate |
| `dbt_enabled_reported` | `YES` `NO` `UNKNOWN` | from seeding-status check |
| `multiple_accounts` | `YES` `NO` `UNKNOWN` | more than one account with Aadhaar |
| `account_changed_since_application` | `YES` `NO` `UNKNOWN` | |
| `name_matches_bank` | `YES` `NO` `UNKNOWN` | |
| `passbook_checked_recently` | `YES` `NO` `UNKNOWN` | |
| `credit_seen` | `YES` `NO` `UNKNOWN` | |
| `peers_paid` | `YES` `NO` `UNKNOWN` | classmates on same scheme paid? |
| `fee_deadline_pressure` | `YES` `NO` `UNKNOWN` | drives urgency copy only |

Anything the model returns outside this set is dropped, logged, and never persisted.

## 5. Event types

`CASE_CREATED`, `INTAKE_RECEIVED`, `FACTS_EXTRACTED`, `FACT_EDITED`, `QUESTION_ASKED`,
`ANSWER_RECORDED`, `DIAGNOSIS_CREATED`, `ACTIONS_ISSUED`, `ARTIFACT_GENERATED`, `ARTIFACT_EDITED`,
`ACTION_COMPLETED`, `VERIFICATION_RUN`, `GOV_RECORD_CHANGED` (actor `DEMO_GOV`), `ESCALATED`,
`CASE_RESOLVED`, `AI_FALLBACK_USED`, `ERROR`.

## 6. In-memory fallback (`lib/db/memory.ts`)

- `Map<string, ...>` per table, same shapes, same ordering guarantees.
- Seeded at boot from `lib/gov-mock/seed.ts` so demo cases work with no database at all.
- Logs `Using in-memory store — cases will be lost on restart` once at boot.
- The repository test suite runs against both implementations with the same assertions.

## 7. Retention

- No personal data by design (`lib/redact.ts`).
- Cases older than 7 days are deleted by `DELETE FROM cases WHERE created_at < now() - interval '7 days'`
  run lazily on case creation (1-in-20 chance) — no cron needed. State the 7-day retention on `/about`.
