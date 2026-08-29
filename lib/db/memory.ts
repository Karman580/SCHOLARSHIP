import { randomUUID } from 'node:crypto';
import type {
  Action, ActionInput, Artifact, ArtifactInput, Case, CaseState, CaseWithRelations, Diagnosis,
  DiagnosisInput, Escalation, CaseEvent, EventInput, Evidence, EvidenceInput, Fact, FactInput,
  GovAccount, GovApplication, GovMapping, GovPayment, Language, MockAction, QuestionAsked,
} from '../types';
import { newToken } from '../token';
import { SEEDS, seedFor } from '../gov-mock/seed';
import { applyMockAction, type GovRecords } from '../gov-mock/mutate';
import type { Repo } from './repo-types';

type Row<T> = Map<string, T>;

const nowIso = () => new Date().toISOString();

type StoredFact = Fact & { superseded: boolean };

export class MemoryRepo implements Repo {
  readonly kind = 'memory' as const;

  private cases: Row<Case> = new Map();
  private byToken = new Map<string, string>();
  private facts: StoredFact[] = [];
  private evidence: Evidence[] = [];
  private questions: QuestionAsked[] = [];
  private diagnoses: Diagnosis[] = [];
  private actions: Action[] = [];
  private artifacts: Artifact[] = [];
  private events: CaseEvent[] = [];
  private escalations: Escalation[] = [];

  private applications: Row<GovApplication> = new Map();
  private payments: Row<GovPayment> = new Map();
  private mappings: Row<GovMapping> = new Map();
  private accounts: Row<GovAccount> = new Map();

  constructor() {
    for (const s of SEEDS) this.writeSeed(s.caseNo);
  }

  private writeSeed(caseNo: number): void {
    const s = seedFor(caseNo);
    this.applications.set(s.application.applicationId, s.application);
    this.payments.set(s.payment.applicationId, s.payment);
    this.mappings.set(s.mapping.aliasKey, s.mapping);
    this.accounts.set(s.account.bankRefId, s.account);
    // A NEW_ACCOUNT_PROVIDED run leaves a spare row behind; drop it on reset.
    this.accounts.delete(`${s.account.bankRefId}-NEW`);
  }

  async createCase(input: { isDemo?: boolean; demoCaseNo?: number; language?: Language; applicationId?: string }): Promise<Case> {
    const id = randomUUID();
    const token = newToken();
    const c: Case = {
      id,
      token,
      state: 'NEW',
      isDemo: Boolean(input.isDemo),
      demoCaseNo: input.demoCaseNo ?? null,
      language: input.language ?? 'en',
      aiMode: 'model',
      simulatedDayOffset: 0,
      applicationId: input.applicationId ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.cases.set(id, c);
    this.byToken.set(token, id);
    return c;
  }

  private touch(caseId: string): void {
    const c = this.cases.get(caseId);
    if (c) c.updatedAt = nowIso();
  }

  async getCaseByToken(token: string): Promise<CaseWithRelations | null> {
    const id = this.byToken.get(token);
    if (!id) return null;
    const c = this.cases.get(id);
    if (!c) return null;
    return {
      case: c,
      facts: await this.getFacts(id),
      evidence: await this.getEvidence(id),
      questions: await this.getQuestions(id),
      diagnosis: await this.latestDiagnosis(id),
      actions: await this.getActions(id),
      artifacts: await this.getArtifacts(id),
      events: await this.getEvents(id),
      escalations: await this.getEscalations(id),
    };
  }

  async setCaseState(caseId: string, state: CaseState): Promise<void> {
    const c = this.cases.get(caseId);
    if (c) { c.state = state; c.updatedAt = nowIso(); }
  }

  async setAiMode(caseId: string, mode: 'model' | 'fallback'): Promise<void> {
    const c = this.cases.get(caseId);
    if (c) { c.aiMode = mode; this.touch(caseId); }
  }

  async setLanguage(caseId: string, language: Language): Promise<void> {
    const c = this.cases.get(caseId);
    if (c) { c.language = language; this.touch(caseId); }
  }

  async advanceSimulatedDays(caseId: string, days: number): Promise<number> {
    const c = this.cases.get(caseId);
    if (!c) return 0;
    c.simulatedDayOffset += days;
    this.touch(caseId);
    return c.simulatedDayOffset;
  }

  async upsertFacts(caseId: string, facts: FactInput[]): Promise<void> {
    for (const f of facts) {
      for (const existing of this.facts) {
        if (existing.caseId === caseId && existing.key === f.key) existing.superseded = true;
      }
      this.facts.push({
        id: randomUUID(),
        caseId,
        key: f.key,
        value: f.value,
        provenance: f.provenance,
        confidence: f.confidence ?? null,
        quote: f.quote ?? null,
        superseded: false,
        createdAt: nowIso(),
      });
    }
    this.touch(caseId);
  }

  async getFacts(caseId: string): Promise<Fact[]> {
    return this.facts.filter((f) => f.caseId === caseId && !f.superseded).map(({ superseded, ...f }) => { void superseded; return f; });
  }

  async addEvidence(caseId: string, e: EvidenceInput): Promise<void> {
    this.evidence.push({ id: randomUUID(), caseId, createdAt: nowIso(), ...e });
  }

  async getEvidence(caseId: string): Promise<Evidence[]> {
    return this.evidence.filter((e) => e.caseId === caseId);
  }

  async recordQuestion(caseId: string, q: { questionId: string; promptShown: string; seq: number }): Promise<string> {
    const existing = this.questions.find((x) => x.caseId === caseId && x.seq === q.seq);
    if (existing) {
      existing.questionId = q.questionId;
      existing.promptShown = q.promptShown;
      existing.answerValue = null;
      existing.answeredAt = null;
      return existing.id;
    }
    const row: QuestionAsked = {
      id: randomUUID(), caseId, questionId: q.questionId, promptShown: q.promptShown,
      answerValue: null, answeredAt: null, seq: q.seq, createdAt: nowIso(),
    };
    this.questions.push(row);
    return row.id;
  }

  async recordAnswer(caseId: string, questionId: string, answerValue: string): Promise<void> {
    const row = [...this.questions].reverse().find((q) => q.caseId === caseId && q.questionId === questionId);
    if (row) { row.answerValue = answerValue; row.answeredAt = nowIso(); }
    this.touch(caseId);
  }

  async getQuestions(caseId: string): Promise<QuestionAsked[]> {
    return this.questions.filter((q) => q.caseId === caseId).sort((a, b) => a.seq - b.seq);
  }

  async invalidateAnswersAfter(caseId: string, seq: number): Promise<void> {
    this.questions = this.questions.filter((q) => !(q.caseId === caseId && q.seq > seq));
  }

  async saveDiagnosis(caseId: string, d: DiagnosisInput): Promise<Diagnosis> {
    const row: Diagnosis = { id: randomUUID(), caseId, createdAt: nowIso(), ...d };
    this.diagnoses.push(row);
    this.touch(caseId);
    return row;
  }

  async latestDiagnosis(caseId: string): Promise<Diagnosis | null> {
    const rows = this.diagnoses.filter((d) => d.caseId === caseId);
    return rows.length ? rows[rows.length - 1]! : null;
  }

  async saveActions(caseId: string, diagnosisId: string, actions: ActionInput[]): Promise<Action[]> {
    this.actions = this.actions.filter((a) => a.caseId !== caseId);
    const rows = actions.map((a) => ({
      id: randomUUID(), caseId, diagnosisId, completedAt: null, outcome: null, createdAt: nowIso(),
      ...a, artifactType: a.artifactType ?? null,
    }));
    this.actions.push(...rows);
    this.touch(caseId);
    return rows;
  }

  async completeAction(caseId: string, actionId: string, outcome?: string): Promise<void> {
    const a = this.actions.find((x) => x.id === actionId && x.caseId === caseId);
    if (a) { a.completedAt = nowIso(); if (outcome) a.outcome = outcome; }
    this.touch(caseId);
  }

  async getActions(caseId: string): Promise<Action[]> {
    return this.actions.filter((a) => a.caseId === caseId).sort((a, b) => a.seq - b.seq);
  }

  async saveArtifact(caseId: string, a: ArtifactInput): Promise<Artifact> {
    const row: Artifact = { id: randomUUID(), caseId, edited: false, createdAt: nowIso(), ...a };
    this.artifacts.push(row);
    this.touch(caseId);
    return row;
  }

  async getArtifact(caseId: string, artifactId: string): Promise<Artifact | null> {
    return this.artifacts.find((a) => a.id === artifactId && a.caseId === caseId) ?? null;
  }

  async getArtifacts(caseId: string): Promise<Artifact[]> {
    return this.artifacts.filter((a) => a.caseId === caseId);
  }

  async updateArtifactBody(artifactId: string, body: string): Promise<void> {
    const a = this.artifacts.find((x) => x.id === artifactId);
    if (a) { a.body = body; a.edited = true; }
  }

  async addEvent(caseId: string, e: EventInput): Promise<void> {
    this.events.push({ id: randomUUID(), caseId, createdAt: nowIso(), ...e });
  }

  async getEvents(caseId: string): Promise<CaseEvent[]> {
    return this.events.filter((e) => e.caseId === caseId);
  }

  async addEscalation(caseId: string, rung: string, artifactId?: string): Promise<Escalation> {
    const row: Escalation = { id: randomUUID(), caseId, rung, reachedAt: nowIso(), artifactId: artifactId ?? null };
    this.escalations.push(row);
    this.touch(caseId);
    return row;
  }

  async getEscalations(caseId: string): Promise<Escalation[]> {
    return this.escalations.filter((e) => e.caseId === caseId);
  }

  async sweepExpiredCases(): Promise<number> {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    let n = 0;
    for (const [id, c] of this.cases) {
      if (new Date(c.createdAt).getTime() < cutoff) {
        this.cases.delete(id);
        this.byToken.delete(c.token);
        this.facts = this.facts.filter((f) => f.caseId !== id);
        this.evidence = this.evidence.filter((e) => e.caseId !== id);
        this.questions = this.questions.filter((q) => q.caseId !== id);
        this.diagnoses = this.diagnoses.filter((d) => d.caseId !== id);
        this.actions = this.actions.filter((a) => a.caseId !== id);
        this.artifacts = this.artifacts.filter((a) => a.caseId !== id);
        this.events = this.events.filter((e) => e.caseId !== id);
        this.escalations = this.escalations.filter((e) => e.caseId !== id);
        n++;
      }
    }
    return n;
  }

  gov = {
    getApplication: async (id: string): Promise<GovApplication | null> => this.applications.get(id) ?? null,
    getPayment: async (applicationId: string): Promise<GovPayment | null> => this.payments.get(applicationId) ?? null,
    getMapping: async (aliasKey: string): Promise<GovMapping | null> => this.mappings.get(aliasKey) ?? null,
    getAccount: async (bankRefId: string): Promise<GovAccount | null> => this.accounts.get(bankRefId) ?? null,
    resetSeed: async (caseNo: number): Promise<void> => { this.writeSeed(caseNo); },
    seeded: async (): Promise<boolean> => this.applications.size >= SEEDS.length,
    applyRealWorldAction: async (input: { applicationId: string; action: MockAction; simulatedDayOffset: number }) => {
      const application = this.applications.get(input.applicationId);
      if (!application) return { summary: 'No demo record for this application.', advanceDays: 0 };
      const records: GovRecords = {
        application,
        payment: this.payments.get(input.applicationId)!,
        mapping: this.mappings.get(application.aliasKey)!,
        account: this.accounts.get(application.bankRefId)!,
      };
      const { records: next, summary, advanceDays } = applyMockAction(records, input.action, input.simulatedDayOffset);
      this.applications.set(next.application.applicationId, next.application);
      this.payments.set(next.payment.applicationId, next.payment);
      this.mappings.set(next.mapping.aliasKey, next.mapping);
      this.accounts.set(next.account.bankRefId, next.account);
      return { summary, advanceDays };
    },
  };
}
