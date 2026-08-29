import type {
  Action, ActionInput, Artifact, ArtifactInput, Case, CaseState, CaseWithRelations, Diagnosis,
  DiagnosisInput, Escalation, CaseEvent, EventInput, Evidence, EvidenceInput, Fact, FactInput,
  GovAccount, GovApplication, GovMapping, GovPayment, Language, MockAction, QuestionAsked,
} from '../types';

export interface Repo {
  readonly kind: 'postgres' | 'memory';

  createCase(input: { isDemo?: boolean; demoCaseNo?: number; language?: Language; applicationId?: string }): Promise<Case>;
  getCaseByToken(token: string): Promise<CaseWithRelations | null>;
  setCaseState(caseId: string, state: CaseState): Promise<void>;
  setAiMode(caseId: string, mode: 'model' | 'fallback'): Promise<void>;
  setLanguage(caseId: string, language: Language): Promise<void>;
  advanceSimulatedDays(caseId: string, days: number): Promise<number>;

  upsertFacts(caseId: string, facts: FactInput[]): Promise<void>;
  getFacts(caseId: string): Promise<Fact[]>;

  addEvidence(caseId: string, e: EvidenceInput): Promise<void>;
  getEvidence(caseId: string): Promise<Evidence[]>;

  recordQuestion(caseId: string, q: { questionId: string; promptShown: string; seq: number }): Promise<string>;
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
  getArtifacts(caseId: string): Promise<Artifact[]>;
  updateArtifactBody(artifactId: string, body: string): Promise<void>;

  addEvent(caseId: string, e: EventInput): Promise<void>;
  getEvents(caseId: string): Promise<CaseEvent[]>;

  addEscalation(caseId: string, rung: string, artifactId?: string): Promise<Escalation>;
  getEscalations(caseId: string): Promise<Escalation[]>;

  sweepExpiredCases(): Promise<number>;

  gov: {
    getApplication(id: string): Promise<GovApplication | null>;
    getPayment(applicationId: string): Promise<GovPayment | null>;
    getMapping(aliasKey: string): Promise<GovMapping | null>;
    getAccount(bankRefId: string): Promise<GovAccount | null>;
    resetSeed(caseNo: number): Promise<void>;
    seeded(): Promise<boolean>;
    applyRealWorldAction(input: { applicationId: string; action: MockAction; simulatedDayOffset: number }): Promise<{ summary: string; advanceDays: number }>;
  };
}
