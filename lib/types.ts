export const CASE_STATES = [
  'NEW', 'INTAKE', 'EXTRACTED', 'QUESTIONING', 'DIAGNOSED', 'ACTION_PLANNED',
  'AWAITING_VERIFICATION', 'VERIFYING', 'NEEDS_MORE_INFO', 'ESCALATED', 'RESOLVED', 'ABANDONED',
] as const;
export type CaseState = (typeof CASE_STATES)[number];

export const PROVENANCES = ['PUBLIC_RULE', 'SIMULATED', 'USER_STATED', 'AI_INFERENCE'] as const;
export type Provenance = (typeof PROVENANCES)[number];

export const EVIDENCE_KINDS = ['FREE_TEXT', 'PASTED_STATUS', 'SCREENSHOT_TEXT', 'ANSWER', 'NOTE'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ARTIFACT_TYPES = [
  'BANK_DBT_REQUEST', 'BANK_REACTIVATION_REQUEST', 'INSTITUTE_FOLLOWUP',
  'PORTAL_GRIEVANCE', 'RTI_DRAFT', 'CASE_SUMMARY',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const JOURNEY_STATUSES = ['CONFIRMED', 'LIKELY', 'UNKNOWN', 'BLOCKED', 'NOT_REACHED'] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export type Language = 'en' | 'hi';
export type AiMode = 'model' | 'fallback';
export type Band = 'HIGH' | 'MEDIUM' | 'LOW';

export type Case = {
  id: string;
  token: string;
  state: CaseState;
  isDemo: boolean;
  demoCaseNo: number | null;
  language: Language;
  aiMode: AiMode;
  /** Days of simulated time this case has advanced. Never real time. */
  simulatedDayOffset: number;
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Fact = {
  id: string;
  caseId: string;
  key: string;
  value: string;
  provenance: Provenance;
  confidence: number | null;
  quote?: string | null;
  supersededreserved?: never;
  createdAt: string;
};

export type FactInput = {
  key: string;
  value: string;
  provenance: Provenance;
  confidence?: number | null;
  quote?: string | null;
};

export type EvidenceInput = { kind: EvidenceKind; content: string; sourceLabel?: string };
export type Evidence = EvidenceInput & { id: string; caseId: string; createdAt: string };

export type QuestionAsked = {
  id: string;
  caseId: string;
  questionId: string;
  promptShown: string;
  answerValue: string | null;
  answeredAt: string | null;
  seq: number;
  createdAt: string;
};

export type JourneyStage = {
  stageId: number;
  label: string;
  status: JourneyStatus;
  provenance: Provenance;
  note?: string;
};

export type RankedHypothesis = {
  hypothesisId: string;
  label: string;
  confidence: number;
  why: string[];
  disproveBy: string[];
};

export type KnownItem = { text: string; provenance: Provenance };
export type UnknownItem = { id: string; text: string; howToFindOut: string };

export type DiagnosisInput = {
  ranked: RankedHypothesis[];
  topHypothesis: string;
  band: Band;
  known: KnownItem[];
  unknown: UnknownItem[];
  journey: JourneyStage[];
  verdictText: string;
  engineVersion: string;
};
export type Diagnosis = DiagnosisInput & { id: string; caseId: string; createdAt: string };

export type Outcome = { id: string; label: string; mockAction: MockAction };

export type ActionBody = {
  doThis: string;
  where: string;
  takeWith: string[];
  expect: string;
  typicalTime: string;
  outcomes: Outcome[];
  note?: string;
};

export type ActionInput = {
  actionKey: string;
  seq: number;
  title: string;
  body: ActionBody;
  artifactType?: ArtifactType | null;
};
export type Action = ActionInput & {
  id: string;
  caseId: string;
  diagnosisId: string | null;
  completedAt: string | null;
  outcome: string | null;
  createdAt: string;
};

export type ArtifactInput = {
  type: ArtifactType;
  language: Language;
  recipient: string;
  subject: string | null;
  body: string;
  placeholders: string[];
  generatedBy: 'model' | 'template';
};
export type Artifact = ArtifactInput & {
  id: string;
  caseId: string;
  edited: boolean;
  createdAt: string;
};

export type EventType =
  | 'CASE_CREATED' | 'INTAKE_RECEIVED' | 'FACTS_EXTRACTED' | 'FACT_EDITED' | 'QUESTION_ASKED'
  | 'ANSWER_RECORDED' | 'DIAGNOSIS_CREATED' | 'ACTIONS_ISSUED' | 'ARTIFACT_GENERATED'
  | 'ARTIFACT_EDITED' | 'ACTION_COMPLETED' | 'VERIFICATION_RUN' | 'GOV_RECORD_CHANGED'
  | 'ESCALATED' | 'CASE_RESOLVED' | 'AI_FALLBACK_USED' | 'STATE_CHANGED' | 'ERROR';

export type EventInput = {
  type: EventType;
  actor: 'USER' | 'SAATHI' | 'DEMO_GOV';
  summary: string;
  payload?: unknown;
};
export type CaseEvent = EventInput & { id: string; caseId: string; createdAt: string };

export type Escalation = {
  id: string;
  caseId: string;
  rung: string;
  reachedAt: string;
  artifactId: string | null;
};

export type MockAction =
  | 'BANK_SEEDED_DBT' | 'ACCOUNT_REACTIVATED' | 'NAME_CORRECTED' | 'NEW_ACCOUNT_PROVIDED'
  | 'INSTITUTE_VERIFIED' | 'PAYMENT_REPUSHED' | 'NOTHING_HAPPENED';

export type GovApplication = {
  applicationId: string;
  studentAlias: string;
  nameOnApplication: string;
  scheme: string;
  academicYear: string;
  amountPaise: number;
  instituteVerifiedAt: string | null;
  stateVerifiedAt: string | null;
  sanctionedAt: string | null;
  portalStatusText: string;
  bankRefId: string;
  aliasKey: string;
};

export type GovPayment = {
  paymentId: string | null;
  applicationId: string;
  status: 'NO_RECORD' | 'PENDING_AT_AGENCY' | 'PROCESSED' | 'RETURNED';
  processedAt: string | null;
  returnReason: string | null;
  utr: string | null;
  /**
   * Simulated-time gate. A queued payment reads as PENDING_AT_AGENCY until the case's
   * simulatedDayOffset reaches this value. Nothing here tracks real time.
   */
  pendingUntilDay: number | null;
};

export type GovMapping = {
  mappingId: string;
  aliasKey: string;
  mappedBank: string | null;
  dbtEnabled: boolean;
  lastUpdated: string | null;
};

export type GovAccount = {
  bankRefId: string;
  bankName: string;
  accountMasked: string;
  accountStatus: 'ACTIVE' | 'DORMANT' | 'CLOSED' | 'MIN_KYC_LIMIT';
  nameOnAccount: string;
  aadhaarSeeded: boolean;
  dbtEnabled: boolean;
};

export type CaseWithRelations = {
  case: Case;
  facts: Fact[];
  evidence: Evidence[];
  questions: QuestionAsked[];
  diagnosis: Diagnosis | null;
  actions: Action[];
  artifacts: Artifact[];
  events: CaseEvent[];
  escalations: Escalation[];
};
