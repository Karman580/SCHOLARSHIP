-- Scholarship Saathi schema. One version, idempotent, no migration tool.

DO $$ BEGIN
  CREATE TYPE case_state AS ENUM (
    'NEW','INTAKE','EXTRACTED','QUESTIONING','DIAGNOSED','ACTION_PLANNED',
    'AWAITING_VERIFICATION','VERIFYING','NEEDS_MORE_INFO','ESCALATED','RESOLVED','ABANDONED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provenance AS ENUM ('PUBLIC_RULE','SIMULATED','USER_STATED','AI_INFERENCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_kind AS ENUM ('FREE_TEXT','PASTED_STATUS','SCREENSHOT_TEXT','ANSWER','NOTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE artifact_type AS ENUM (
    'BANK_DBT_REQUEST','BANK_REACTIVATION_REQUEST','INSTITUTE_FOLLOWUP',
    'PORTAL_GRIEVANCE','RTI_DRAFT','CASE_SUMMARY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE journey_status AS ENUM ('CONFIRMED','LIKELY','UNKNOWN','BLOCKED','NOT_REACHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                text UNIQUE NOT NULL,
  state                case_state NOT NULL DEFAULT 'NEW',
  is_demo              boolean NOT NULL DEFAULT false,
  demo_case_no         int,
  language             text NOT NULL DEFAULT 'en',
  ai_mode              text NOT NULL DEFAULT 'model',
  simulated_day_offset int NOT NULL DEFAULT 0,
  application_id       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_created_idx ON cases (created_at DESC);

CREATE TABLE IF NOT EXISTS facts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  key        text NOT NULL,
  value      text,
  provenance provenance NOT NULL,
  confidence real,
  quote      text,
  superseded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facts_live_idx ON facts (case_id, key) WHERE superseded = false;

CREATE TABLE IF NOT EXISTS evidence (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind         evidence_kind NOT NULL,
  content      text NOT NULL,
  source_label text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions_asked (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  question_id  text NOT NULL,
  prompt_shown text NOT NULL,
  answer_value text,
  answered_at  timestamptz,
  seq          int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS questions_seq_idx ON questions_asked (case_id, seq);

CREATE TABLE IF NOT EXISTS diagnoses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  ranked         jsonb NOT NULL,
  top_hypothesis text NOT NULL,
  band           text NOT NULL,
  known          jsonb NOT NULL,
  unknown        jsonb NOT NULL,
  journey        jsonb NOT NULL,
  verdict_text   text NOT NULL,
  engine_version text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diagnoses_case_idx ON diagnoses (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  diagnosis_id  uuid REFERENCES diagnoses(id) ON DELETE SET NULL,
  action_key    text NOT NULL,
  seq           int NOT NULL,
  title         text NOT NULL,
  body          jsonb NOT NULL,
  artifact_type artifact_type,
  completed_at  timestamptz,
  outcome       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actions_case_idx ON actions (case_id, seq);

CREATE TABLE IF NOT EXISTS artifacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type         artifact_type NOT NULL,
  language     text NOT NULL DEFAULT 'en',
  recipient    text NOT NULL,
  subject      text,
  body         text NOT NULL,
  placeholders jsonb NOT NULL DEFAULT '[]',
  generated_by text NOT NULL,
  edited       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type       text NOT NULL,
  actor      text NOT NULL,
  summary    text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_case_idx ON events (case_id, created_at);

CREATE TABLE IF NOT EXISTS escalations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  rung        text NOT NULL,
  reached_at  timestamptz NOT NULL DEFAULT now(),
  artifact_id uuid REFERENCES artifacts(id)
);

-- Mock government tables. Every row is synthetic.
CREATE TABLE IF NOT EXISTS gov_applications (
  application_id        text PRIMARY KEY,
  student_alias         text NOT NULL,
  name_on_application   text NOT NULL,
  scheme                text NOT NULL,
  academic_year         text NOT NULL,
  amount_paise          bigint NOT NULL,
  institute_verified_at date,
  state_verified_at     date,
  sanctioned_at         date,
  portal_status_text    text NOT NULL,
  bank_ref_id           text NOT NULL,
  alias_key             text NOT NULL
);

CREATE TABLE IF NOT EXISTS gov_payments (
  application_id     text PRIMARY KEY REFERENCES gov_applications(application_id) ON DELETE CASCADE,
  payment_id         text,
  status             text NOT NULL,
  processed_at       date,
  return_reason      text,
  utr                text,
  pending_until_day  int
);

CREATE TABLE IF NOT EXISTS gov_aadhaar_mapping (
  alias_key    text PRIMARY KEY,
  mapping_id   text NOT NULL,
  mapped_bank  text,
  dbt_enabled  boolean NOT NULL DEFAULT false,
  last_updated date
);

CREATE TABLE IF NOT EXISTS gov_bank_accounts (
  bank_ref_id     text PRIMARY KEY,
  bank_name       text NOT NULL,
  account_masked  text NOT NULL,
  account_status  text NOT NULL,
  name_on_account text NOT NULL,
  aadhaar_seeded  boolean NOT NULL DEFAULT false,
  dbt_enabled     boolean NOT NULL DEFAULT false
);
