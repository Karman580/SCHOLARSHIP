import postgres from 'postgres';
import type {
  Action, ActionInput, Artifact, ArtifactInput, Case, CaseState, CaseWithRelations, Diagnosis,
  DiagnosisInput, Escalation, CaseEvent, EventInput, Evidence, EvidenceInput, Fact, FactInput,
  GovAccount, GovApplication, GovMapping, GovPayment, Language, MockAction, QuestionAsked,
} from '../types';
import { newToken } from '../token';
import { SEEDS, seedFor } from '../gov-mock/seed';
import { applyMockAction, type GovRecords } from '../gov-mock/mutate';
import type { Repo } from './repo-types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sql = postgres.Sql<Record<string, unknown>>;

export function createSql(url: string): Sql {
  // prepare:false is required under a transaction pooler. Do not remove it.
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20, transform: { undefined: null } });
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown): string | null => (v == null ? null : iso(v).slice(0, 10));

function toCase(r: any): Case {
  return {
    id: r.id, token: r.token, state: r.state, isDemo: r.is_demo, demoCaseNo: r.demo_case_no,
    language: r.language, aiMode: r.ai_mode, simulatedDayOffset: r.simulated_day_offset,
    applicationId: r.application_id, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

export class PgRepo implements Repo {
  readonly kind = 'postgres' as const;
  constructor(private sql: Sql) {}

  async createCase(input: { isDemo?: boolean; demoCaseNo?: number; language?: Language; applicationId?: string }): Promise<Case> {
    const [row] = await this.sql`
      INSERT INTO cases (token, is_demo, demo_case_no, language, application_id)
      VALUES (${newToken()}, ${Boolean(input.isDemo)}, ${input.demoCaseNo ?? null}, ${input.language ?? 'en'}, ${input.applicationId ?? null})
      RETURNING *`;
    return toCase(row);
  }

  async getCaseByToken(token: string): Promise<CaseWithRelations | null> {
    const [row] = await this.sql`SELECT * FROM cases WHERE token = ${token}`;
    if (!row) return null;
    const c = toCase(row);
    return {
      case: c,
      facts: await this.getFacts(c.id),
      evidence: await this.getEvidence(c.id),
      questions: await this.getQuestions(c.id),
      diagnosis: await this.latestDiagnosis(c.id),
      actions: await this.getActions(c.id),
      artifacts: await this.getArtifacts(c.id),
      events: await this.getEvents(c.id),
      escalations: await this.getEscalations(c.id),
    };
  }

  async setCaseState(caseId: string, state: CaseState): Promise<void> {
    await this.sql`UPDATE cases SET state = ${state}::case_state, updated_at = now() WHERE id = ${caseId}`;
  }

  async setAiMode(caseId: string, mode: 'model' | 'fallback'): Promise<void> {
    await this.sql`UPDATE cases SET ai_mode = ${mode}, updated_at = now() WHERE id = ${caseId}`;
  }

  async setLanguage(caseId: string, language: Language): Promise<void> {
    await this.sql`UPDATE cases SET language = ${language}, updated_at = now() WHERE id = ${caseId}`;
  }

  async advanceSimulatedDays(caseId: string, days: number): Promise<number> {
    const [row] = await this.sql`
      UPDATE cases SET simulated_day_offset = simulated_day_offset + ${days}, updated_at = now()
      WHERE id = ${caseId} RETURNING simulated_day_offset`;
    return (row as any)?.simulated_day_offset ?? 0;
  }

  async upsertFacts(caseId: string, facts: FactInput[]): Promise<void> {
    if (!facts.length) return;
    await this.sql.begin(async (tx) => {
      for (const f of facts) {
        await tx`UPDATE facts SET superseded = true WHERE case_id = ${caseId} AND key = ${f.key} AND superseded = false`;
        await tx`INSERT INTO facts (case_id, key, value, provenance, confidence, quote)
                 VALUES (${caseId}, ${f.key}, ${f.value}, ${f.provenance}::provenance, ${f.confidence ?? null}, ${f.quote ?? null})`;
      }
      await tx`UPDATE cases SET updated_at = now() WHERE id = ${caseId}`;
    });
  }

  async getFacts(caseId: string): Promise<Fact[]> {
    const rows = await this.sql`SELECT * FROM facts WHERE case_id = ${caseId} AND superseded = false ORDER BY created_at`;
    return rows.map((r: any) => ({
      id: r.id, caseId: r.case_id, key: r.key, value: r.value, provenance: r.provenance,
      confidence: r.confidence, quote: r.quote, createdAt: iso(r.created_at),
    }));
  }

  async addEvidence(caseId: string, e: EvidenceInput): Promise<void> {
    await this.sql`INSERT INTO evidence (case_id, kind, content, source_label)
                   VALUES (${caseId}, ${e.kind}::evidence_kind, ${e.content}, ${e.sourceLabel ?? null})`;
  }

  async getEvidence(caseId: string): Promise<Evidence[]> {
    const rows = await this.sql`SELECT * FROM evidence WHERE case_id = ${caseId} ORDER BY created_at`;
    return rows.map((r: any) => ({ id: r.id, caseId: r.case_id, kind: r.kind, content: r.content, sourceLabel: r.source_label ?? undefined, createdAt: iso(r.created_at) }));
  }

  async recordQuestion(caseId: string, q: { questionId: string; promptShown: string; seq: number }): Promise<string> {
    const [row] = await this.sql`
      INSERT INTO questions_asked (case_id, question_id, prompt_shown, seq)
      VALUES (${caseId}, ${q.questionId}, ${q.promptShown}, ${q.seq})
      ON CONFLICT (case_id, seq) DO UPDATE
        SET question_id = EXCLUDED.question_id, prompt_shown = EXCLUDED.prompt_shown,
            answer_value = NULL, answered_at = NULL
      RETURNING id`;
    return (row as any).id;
  }

  async recordAnswer(caseId: string, questionId: string, answerValue: string): Promise<void> {
    await this.sql`
      UPDATE questions_asked SET answer_value = ${answerValue}, answered_at = now()
      WHERE id = (SELECT id FROM questions_asked WHERE case_id = ${caseId} AND question_id = ${questionId} ORDER BY seq DESC LIMIT 1)`;
  }

  async getQuestions(caseId: string): Promise<QuestionAsked[]> {
    const rows = await this.sql`SELECT * FROM questions_asked WHERE case_id = ${caseId} ORDER BY seq`;
    return rows.map((r: any) => ({
      id: r.id, caseId: r.case_id, questionId: r.question_id, promptShown: r.prompt_shown,
      answerValue: r.answer_value, answeredAt: r.answered_at ? iso(r.answered_at) : null,
      seq: r.seq, createdAt: iso(r.created_at),
    }));
  }

  async invalidateAnswersAfter(caseId: string, seq: number): Promise<void> {
    await this.sql`DELETE FROM questions_asked WHERE case_id = ${caseId} AND seq > ${seq}`;
  }

  async saveDiagnosis(caseId: string, d: DiagnosisInput): Promise<Diagnosis> {
    const [row] = await this.sql`
      INSERT INTO diagnoses (case_id, ranked, top_hypothesis, band, known, unknown, journey, verdict_text, engine_version)
      VALUES (${caseId}, ${this.sql.json(d.ranked as any)}, ${d.topHypothesis}, ${d.band},
              ${this.sql.json(d.known as any)}, ${this.sql.json(d.unknown as any)}, ${this.sql.json(d.journey as any)},
              ${d.verdictText}, ${d.engineVersion})
      RETURNING *`;
    return this.toDiagnosis(row);
  }

  private toDiagnosis(r: any): Diagnosis {
    return {
      id: r.id, caseId: r.case_id, ranked: r.ranked, topHypothesis: r.top_hypothesis, band: r.band,
      known: r.known, unknown: r.unknown, journey: r.journey, verdictText: r.verdict_text,
      engineVersion: r.engine_version, createdAt: iso(r.created_at),
    };
  }

  async latestDiagnosis(caseId: string): Promise<Diagnosis | null> {
    const [row] = await this.sql`SELECT * FROM diagnoses WHERE case_id = ${caseId} ORDER BY created_at DESC LIMIT 1`;
    return row ? this.toDiagnosis(row) : null;
  }

  async saveActions(caseId: string, diagnosisId: string, actions: ActionInput[]): Promise<Action[]> {
    return this.sql.begin(async (tx) => {
      await tx`DELETE FROM actions WHERE case_id = ${caseId}`;
      const out: Action[] = [];
      for (const a of actions) {
        const [row] = await tx`
          INSERT INTO actions (case_id, diagnosis_id, action_key, seq, title, body, artifact_type)
          VALUES (${caseId}, ${diagnosisId}, ${a.actionKey}, ${a.seq}, ${a.title},
                  ${tx.json(a.body as any)}, ${a.artifactType ?? null})
          RETURNING *`;
        out.push(this.toAction(row));
      }
      return out;
    }) as Promise<Action[]>;
  }

  private toAction(r: any): Action {
    return {
      id: r.id, caseId: r.case_id, diagnosisId: r.diagnosis_id, actionKey: r.action_key, seq: r.seq,
      title: r.title, body: r.body, artifactType: r.artifact_type,
      completedAt: r.completed_at ? iso(r.completed_at) : null, outcome: r.outcome, createdAt: iso(r.created_at),
    };
  }

  async completeAction(caseId: string, actionId: string, outcome?: string): Promise<void> {
    await this.sql`UPDATE actions SET completed_at = now(), outcome = COALESCE(${outcome ?? null}, outcome)
                   WHERE id = ${actionId} AND case_id = ${caseId}`;
  }

  async getActions(caseId: string): Promise<Action[]> {
    const rows = await this.sql`SELECT * FROM actions WHERE case_id = ${caseId} ORDER BY seq`;
    return rows.map((r: any) => this.toAction(r));
  }

  async saveArtifact(caseId: string, a: ArtifactInput): Promise<Artifact> {
    const [row] = await this.sql`
      INSERT INTO artifacts (case_id, type, language, recipient, subject, body, placeholders, generated_by)
      VALUES (${caseId}, ${a.type}::artifact_type, ${a.language}, ${a.recipient}, ${a.subject ?? null},
              ${a.body}, ${this.sql.json(a.placeholders as any)}, ${a.generatedBy})
      RETURNING *`;
    return this.toArtifact(row);
  }

  private toArtifact(r: any): Artifact {
    return {
      id: r.id, caseId: r.case_id, type: r.type, language: r.language, recipient: r.recipient,
      subject: r.subject, body: r.body, placeholders: r.placeholders, generatedBy: r.generated_by,
      edited: r.edited, createdAt: iso(r.created_at),
    };
  }

  async getArtifact(caseId: string, artifactId: string): Promise<Artifact | null> {
    const [row] = await this.sql`SELECT * FROM artifacts WHERE id = ${artifactId} AND case_id = ${caseId}`;
    return row ? this.toArtifact(row) : null;
  }

  async getArtifacts(caseId: string): Promise<Artifact[]> {
    const rows = await this.sql`SELECT * FROM artifacts WHERE case_id = ${caseId} ORDER BY created_at`;
    return rows.map((r: any) => this.toArtifact(r));
  }

  async updateArtifactBody(artifactId: string, body: string): Promise<void> {
    await this.sql`UPDATE artifacts SET body = ${body}, edited = true WHERE id = ${artifactId}`;
  }

  async addEvent(caseId: string, e: EventInput): Promise<void> {
    await this.sql`INSERT INTO events (case_id, type, actor, summary, payload)
                   VALUES (${caseId}, ${e.type}, ${e.actor}, ${e.summary}, ${e.payload === undefined ? null : this.sql.json(e.payload as any)})`;
  }

  async getEvents(caseId: string): Promise<CaseEvent[]> {
    const rows = await this.sql`SELECT * FROM events WHERE case_id = ${caseId} ORDER BY created_at`;
    return rows.map((r: any) => ({ id: r.id, caseId: r.case_id, type: r.type, actor: r.actor, summary: r.summary, payload: r.payload, createdAt: iso(r.created_at) }));
  }

  async addEscalation(caseId: string, rung: string, artifactId?: string): Promise<Escalation> {
    const [row] = await this.sql`INSERT INTO escalations (case_id, rung, artifact_id)
                                 VALUES (${caseId}, ${rung}, ${artifactId ?? null}) RETURNING *`;
    const r = row as any;
    return { id: r.id, caseId: r.case_id, rung: r.rung, reachedAt: iso(r.reached_at), artifactId: r.artifact_id };
  }

  async getEscalations(caseId: string): Promise<Escalation[]> {
    const rows = await this.sql`SELECT * FROM escalations WHERE case_id = ${caseId} ORDER BY reached_at`;
    return rows.map((r: any) => ({ id: r.id, caseId: r.case_id, rung: r.rung, reachedAt: iso(r.reached_at), artifactId: r.artifact_id }));
  }

  async sweepExpiredCases(): Promise<number> {
    const rows = await this.sql`DELETE FROM cases WHERE created_at < now() - interval '7 days' RETURNING id`;
    return rows.length;
  }

  private async readRecords(applicationId: string): Promise<GovRecords | null> {
    const application = await this.gov.getApplication(applicationId);
    if (!application) return null;
    const payment = await this.gov.getPayment(applicationId);
    const mapping = await this.gov.getMapping(application.aliasKey);
    const account = await this.gov.getAccount(application.bankRefId);
    if (!payment || !mapping || !account) return null;
    return { application, payment, mapping, account };
  }

  gov = {
    getApplication: async (id: string): Promise<GovApplication | null> => {
      const [r] = await this.sql`SELECT * FROM gov_applications WHERE application_id = ${id}`;
      if (!r) return null;
      const x = r as any;
      return {
        applicationId: x.application_id, studentAlias: x.student_alias, nameOnApplication: x.name_on_application,
        scheme: x.scheme, academicYear: x.academic_year, amountPaise: Number(x.amount_paise),
        instituteVerifiedAt: day(x.institute_verified_at), stateVerifiedAt: day(x.state_verified_at),
        sanctionedAt: day(x.sanctioned_at), portalStatusText: x.portal_status_text,
        bankRefId: x.bank_ref_id, aliasKey: x.alias_key,
      };
    },
    getPayment: async (applicationId: string): Promise<GovPayment | null> => {
      const [r] = await this.sql`SELECT * FROM gov_payments WHERE application_id = ${applicationId}`;
      if (!r) return null;
      const x = r as any;
      return {
        paymentId: x.payment_id, applicationId: x.application_id, status: x.status,
        processedAt: day(x.processed_at), returnReason: x.return_reason, utr: x.utr,
        pendingUntilDay: x.pending_until_day,
      };
    },
    getMapping: async (aliasKey: string): Promise<GovMapping | null> => {
      const [r] = await this.sql`SELECT * FROM gov_aadhaar_mapping WHERE alias_key = ${aliasKey}`;
      if (!r) return null;
      const x = r as any;
      return { mappingId: x.mapping_id, aliasKey: x.alias_key, mappedBank: x.mapped_bank, dbtEnabled: x.dbt_enabled, lastUpdated: day(x.last_updated) };
    },
    getAccount: async (bankRefId: string): Promise<GovAccount | null> => {
      const [r] = await this.sql`SELECT * FROM gov_bank_accounts WHERE bank_ref_id = ${bankRefId}`;
      if (!r) return null;
      const x = r as any;
      return {
        bankRefId: x.bank_ref_id, bankName: x.bank_name, accountMasked: x.account_masked,
        accountStatus: x.account_status, nameOnAccount: x.name_on_account,
        aadhaarSeeded: x.aadhaar_seeded, dbtEnabled: x.dbt_enabled,
      };
    },
    resetSeed: async (caseNo: number): Promise<void> => {
      const s = seedFor(caseNo);
      const { application: a, payment: p, mapping: m, account: acc } = s;
      await this.sql.begin(async (tx) => {
        await tx`INSERT INTO gov_applications (application_id, student_alias, name_on_application, scheme, academic_year, amount_paise, institute_verified_at, state_verified_at, sanctioned_at, portal_status_text, bank_ref_id, alias_key)
          VALUES (${a.applicationId}, ${a.studentAlias}, ${a.nameOnApplication}, ${a.scheme}, ${a.academicYear}, ${a.amountPaise}, ${a.instituteVerifiedAt}, ${a.stateVerifiedAt}, ${a.sanctionedAt}, ${a.portalStatusText}, ${a.bankRefId}, ${a.aliasKey})
          ON CONFLICT (application_id) DO UPDATE SET student_alias = EXCLUDED.student_alias, name_on_application = EXCLUDED.name_on_application,
            scheme = EXCLUDED.scheme, academic_year = EXCLUDED.academic_year, amount_paise = EXCLUDED.amount_paise,
            institute_verified_at = EXCLUDED.institute_verified_at, state_verified_at = EXCLUDED.state_verified_at,
            sanctioned_at = EXCLUDED.sanctioned_at, portal_status_text = EXCLUDED.portal_status_text,
            bank_ref_id = EXCLUDED.bank_ref_id, alias_key = EXCLUDED.alias_key`;
        await tx`INSERT INTO gov_bank_accounts (bank_ref_id, bank_name, account_masked, account_status, name_on_account, aadhaar_seeded, dbt_enabled)
          VALUES (${acc.bankRefId}, ${acc.bankName}, ${acc.accountMasked}, ${acc.accountStatus}, ${acc.nameOnAccount}, ${acc.aadhaarSeeded}, ${acc.dbtEnabled})
          ON CONFLICT (bank_ref_id) DO UPDATE SET bank_name = EXCLUDED.bank_name, account_masked = EXCLUDED.account_masked,
            account_status = EXCLUDED.account_status, name_on_account = EXCLUDED.name_on_account,
            aadhaar_seeded = EXCLUDED.aadhaar_seeded, dbt_enabled = EXCLUDED.dbt_enabled`;
        await tx`DELETE FROM gov_bank_accounts WHERE bank_ref_id = ${`${acc.bankRefId}-NEW`}`;
        await tx`INSERT INTO gov_aadhaar_mapping (alias_key, mapping_id, mapped_bank, dbt_enabled, last_updated)
          VALUES (${m.aliasKey}, ${m.mappingId}, ${m.mappedBank}, ${m.dbtEnabled}, ${m.lastUpdated})
          ON CONFLICT (alias_key) DO UPDATE SET mapping_id = EXCLUDED.mapping_id, mapped_bank = EXCLUDED.mapped_bank,
            dbt_enabled = EXCLUDED.dbt_enabled, last_updated = EXCLUDED.last_updated`;
        await tx`INSERT INTO gov_payments (application_id, payment_id, status, processed_at, return_reason, utr, pending_until_day)
          VALUES (${p.applicationId}, ${p.paymentId}, ${p.status}, ${p.processedAt}, ${p.returnReason}, ${p.utr}, ${p.pendingUntilDay})
          ON CONFLICT (application_id) DO UPDATE SET payment_id = EXCLUDED.payment_id, status = EXCLUDED.status,
            processed_at = EXCLUDED.processed_at, return_reason = EXCLUDED.return_reason, utr = EXCLUDED.utr,
            pending_until_day = EXCLUDED.pending_until_day`;
      });
    },
    seeded: async (): Promise<boolean> => {
      const [r] = await this.sql`SELECT count(*)::int AS n FROM gov_applications`;
      return ((r as any)?.n ?? 0) >= SEEDS.length;
    },
    applyRealWorldAction: async (input: { applicationId: string; action: MockAction; simulatedDayOffset: number }) => {
      const records = await this.readRecords(input.applicationId);
      if (!records) return { summary: 'No demo record for this application.', advanceDays: 0 };
      const { records: n, summary, advanceDays } = applyMockAction(records, input.action, input.simulatedDayOffset);
      await this.sql.begin(async (tx) => {
        await tx`UPDATE gov_applications SET institute_verified_at = ${n.application.instituteVerifiedAt},
                   state_verified_at = ${n.application.stateVerifiedAt}, sanctioned_at = ${n.application.sanctionedAt},
                   bank_ref_id = ${n.application.bankRefId}
                 WHERE application_id = ${n.application.applicationId}`;
        await tx`INSERT INTO gov_bank_accounts (bank_ref_id, bank_name, account_masked, account_status, name_on_account, aadhaar_seeded, dbt_enabled)
                 VALUES (${n.account.bankRefId}, ${n.account.bankName}, ${n.account.accountMasked}, ${n.account.accountStatus}, ${n.account.nameOnAccount}, ${n.account.aadhaarSeeded}, ${n.account.dbtEnabled})
                 ON CONFLICT (bank_ref_id) DO UPDATE SET account_status = EXCLUDED.account_status,
                   name_on_account = EXCLUDED.name_on_account, aadhaar_seeded = EXCLUDED.aadhaar_seeded,
                   dbt_enabled = EXCLUDED.dbt_enabled`;
        await tx`UPDATE gov_aadhaar_mapping SET mapped_bank = ${n.mapping.mappedBank}, dbt_enabled = ${n.mapping.dbtEnabled},
                   last_updated = ${n.mapping.lastUpdated} WHERE alias_key = ${n.mapping.aliasKey}`;
        await tx`UPDATE gov_payments SET payment_id = ${n.payment.paymentId}, status = ${n.payment.status},
                   processed_at = ${n.payment.processedAt}, return_reason = ${n.payment.returnReason},
                   utr = ${n.payment.utr}, pending_until_day = ${n.payment.pendingUntilDay}
                 WHERE application_id = ${n.payment.applicationId}`;
      });
      return { summary, advanceDays };
    },
  };
}
