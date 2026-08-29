import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepo } from '@/lib/db/memory';
import { PgRepo, createSql } from '@/lib/db/pg';
import type { Repo } from '@/lib/db/repo-types';
import { SEEDS } from '@/lib/gov-mock/seed';

/**
 * The same contract, asserted identically against both stores. Postgres is skipped
 * when DATABASE_URL is unset so the suite runs anywhere.
 */
const implementations: { name: string; make: () => Repo; skip: boolean }[] = [
  { name: 'memory', make: () => new MemoryRepo(), skip: false },
  {
    name: 'postgres',
    make: () => new PgRepo(createSql(process.env.DATABASE_URL!)),
    skip: !process.env.DATABASE_URL,
  },
];

for (const impl of implementations) {
  describe.skipIf(impl.skip)(`repository contract (${impl.name})`, () => {
    let repo: Repo;
    beforeEach(async () => {
      repo = impl.make();
      for (const s of SEEDS) await repo.gov.resetSeed(s.caseNo);
    });

    it('creates a case reachable by its token and nothing else', async () => {
      const c = await repo.createCase({});
      expect(c.token).toHaveLength(16);
      expect(await repo.getCaseByToken(c.token)).not.toBeNull();
      expect(await repo.getCaseByToken('zzzzzzzzzzzzzzzz')).toBeNull();
    });

    it('supersedes a fact rather than overwriting it', async () => {
      const c = await repo.createCase({});
      await repo.upsertFacts(c.id, [{ key: 'credit_seen', value: 'NO', provenance: 'AI_INFERENCE' }]);
      await repo.upsertFacts(c.id, [{ key: 'credit_seen', value: 'YES', provenance: 'USER_STATED' }]);
      const facts = await repo.getFacts(c.id);
      expect(facts.filter((f) => f.key === 'credit_seen')).toHaveLength(1);
      expect(facts[0]!.value).toBe('YES');
      expect(facts[0]!.provenance).toBe('USER_STATED');
    });

    it('records questions and answers in sequence', async () => {
      const c = await repo.createCase({});
      await repo.recordQuestion(c.id, { questionId: 'Q_PFMS_LOOKUP', promptShown: 'a?', seq: 1 });
      await repo.recordAnswer(c.id, 'Q_PFMS_LOOKUP', 'RETURNED');
      await repo.recordQuestion(c.id, { questionId: 'Q_DBT_STATUS', promptShown: 'b?', seq: 2 });
      const qs = await repo.getQuestions(c.id);
      expect(qs.map((q) => q.seq)).toEqual([1, 2]);
      expect(qs[0]!.answerValue).toBe('RETURNED');
      await repo.invalidateAnswersAfter(c.id, 1);
      expect(await repo.getQuestions(c.id)).toHaveLength(1);
    });

    it('stores and reads back a diagnosis and its actions', async () => {
      const c = await repo.createCase({});
      const d = await repo.saveDiagnosis(c.id, {
        ranked: [{ hypothesisId: 'H_DBT_NOT_ENABLED', label: 'x', confidence: 0.8, why: ['a'], disproveBy: ['b'] }],
        topHypothesis: 'H_DBT_NOT_ENABLED', band: 'HIGH',
        known: [{ text: 'k', provenance: 'USER_STATED' }],
        unknown: [{ id: 'u', text: 'u', howToFindOut: 'ask' }],
        journey: [{ stageId: 1, label: 's', status: 'CONFIRMED', provenance: 'USER_STATED' }],
        verdictText: 'v', engineVersion: 'test',
      });
      expect((await repo.latestDiagnosis(c.id))!.id).toBe(d.id);

      const actions = await repo.saveActions(c.id, d.id, [{
        actionKey: 'A', seq: 1, title: 't', artifactType: 'BANK_DBT_REQUEST',
        body: { doThis: 'x', where: 'y', takeWith: ['z'], expect: 'e', typicalTime: '1 visit', outcomes: [{ id: 'o', label: 'l', mockAction: 'BANK_SEEDED_DBT' }] },
      }]);
      expect(actions).toHaveLength(1);
      await repo.completeAction(c.id, actions[0]!.id, 'o');
      const back = await repo.getActions(c.id);
      expect(back[0]!.completedAt).toBeTruthy();
      expect(back[0]!.outcome).toBe('o');
      expect(back[0]!.body.outcomes[0]!.mockAction).toBe('BANK_SEEDED_DBT');
    });

    it('stores artifacts and records edits', async () => {
      const c = await repo.createCase({});
      const a = await repo.saveArtifact(c.id, {
        type: 'BANK_DBT_REQUEST', language: 'en', recipient: 'The Branch Manager',
        subject: 's', body: 'b', placeholders: ['your name'], generatedBy: 'template',
      });
      expect(a.edited).toBe(false);
      await repo.updateArtifactBody(a.id, 'edited body');
      const back = await repo.getArtifact(c.id, a.id);
      expect(back!.body).toBe('edited body');
      expect(back!.edited).toBe(true);
      expect(await repo.getArtifact(c.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff')).toBeNull();
    });

    it('appends events and escalations in order', async () => {
      const c = await repo.createCase({});
      await repo.addEvent(c.id, { type: 'CASE_CREATED', actor: 'USER', summary: 'one' });
      await repo.addEvent(c.id, { type: 'DIAGNOSIS_CREATED', actor: 'SAATHI', summary: 'two', payload: { band: 'HIGH' } });
      const events = await repo.getEvents(c.id);
      expect(events.map((e) => e.summary)).toEqual(['one', 'two']);

      await repo.addEscalation(c.id, 'INSTITUTE');
      await repo.addEscalation(c.id, 'STATE_NODAL');
      expect((await repo.getEscalations(c.id)).map((e) => e.rung)).toEqual(['INSTITUTE', 'STATE_NODAL']);
    });

    it('advances simulated days without touching real time', async () => {
      const c = await repo.createCase({});
      expect(await repo.advanceSimulatedDays(c.id, 2)).toBe(2);
      expect(await repo.advanceSimulatedDays(c.id, 3)).toBe(5);
    });

    it('serves every seeded government record and reports unknown ids as absent', async () => {
      for (const s of SEEDS) {
        const app = await repo.gov.getApplication(s.application.applicationId);
        expect(app!.scheme).toBe(s.application.scheme);
        expect(await repo.gov.getPayment(s.application.applicationId)).not.toBeNull();
        expect(await repo.gov.getMapping(s.application.aliasKey)).not.toBeNull();
        expect(await repo.gov.getAccount(s.application.bankRefId)).not.toBeNull();
      }
      expect(await repo.gov.getApplication('NSP-DOES-NOT-EXIST')).toBeNull();
      expect(await repo.gov.seeded()).toBe(true);
    });

    it('resets a seed idempotently after a mutation', async () => {
      await repo.gov.applyRealWorldAction({ applicationId: 'NSP-DEMO-1001', action: 'BANK_SEEDED_DBT', simulatedDayOffset: 0 });
      expect((await repo.gov.getAccount('BANK-DEMO-A'))!.dbtEnabled).toBe(true);
      await repo.gov.resetSeed(1);
      expect((await repo.gov.getAccount('BANK-DEMO-A'))!.dbtEnabled).toBe(false);
      expect((await repo.gov.getPayment('NSP-DEMO-1001'))!.status).toBe('RETURNED');
    });
  });
}
