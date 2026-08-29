import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * testing.md §3: ten messy transcripts, none of them the demo scripts. At least eight
 * must put the right cause in the top three; the rest must land in LOW with a question
 * that separates the possibilities — never a confident wrong answer.
 *
 * Driven through the API rather than the browser: the same service path the UI calls,
 * ten times over, without ten browser journeys.
 */
type Fixture = { name: string; text: string; expect: string | 'LOW' };

const FIXTURES: Fixture[] = [
  {
    name: 'linked but not enabled',
    text: 'post matric wala scholarship December se sanctioned dikha raha hai. account me kuch nahi aaya. bank counter pe pucha to bola aadhaar link hai lekin DBT not enabled hai is account pe.',
    expect: 'H_DBT_NOT_ENABLED',
  },
  {
    name: 'old account nobody touched',
    text: 'Scholarship approved in December. I had given my old account from school days, I have not used it in about three years. The bank person said it is dormant. Money not received.',
    expect: 'H_ACCOUNT_UNUSABLE',
  },
  {
    name: 'nothing in the payment system, nobody paid',
    text: 'My post-matric shows sanctioned since December but no money. Nobody in my class has received it either. On the payment tracking page there is no record against my application.',
    expect: 'H_PAYMENT_NOT_INITIATED',
  },
  {
    name: 'college has not moved it',
    text: 'The portal is still showing institute verification pending — my college has not verified it yet. They keep saying they will do it later. Nothing has come to my account since December.',
    expect: 'H_INSTITUTE_PENDING',
  },
  {
    name: 'processed but nothing landed',
    text: 'PFMS shows processed against my application from December but nothing has arrived in my account. My account is fine, I get other payments in it, and I use it regularly.',
    expect: 'H_ALREADY_PAID_UNSEEN',
  },
  {
    name: 'aadhaar sitting on an older account',
    text: 'sanctioned in December, paisa nahi aaya. maine form me naya account diya tha but my aadhaar is linked to an old account of a different bank. passbook me kuch nahi.',
    expect: 'H_MAPPED_TO_OTHER_ACCOUNT',
  },
  {
    name: 'portal says defective',
    text: 'My application is showing as defective on the portal since December. Nothing has come to my account. I do not know what to correct.',
    expect: 'H_APPLICATION_DEFECTIVE',
  },
  {
    name: 'still under process at the state',
    text: 'Post matric application is under process on the portal since December, it has not moved. College says their part is done. No money has arrived.',
    expect: 'H_STATE_PENDING',
  },
  {
    name: 'almost nothing to go on',
    text: 'i think something is wrong with my scholarship, it is not coming, please help me',
    expect: 'LOW',
  },
  {
    name: 'a feeling, not a fact',
    text: 'mujhe lagta hai kuch gadbad hai scholarship me, koi bata nahi raha kya karna hai',
    expect: 'LOW',
  },
];

async function diagnoseFreeText(request: APIRequestContext, text: string) {
  const created = await request.post('/api/cases', { data: {} });
  expect(created.ok(), 'case created').toBeTruthy();
  const { token } = (await created.json()) as { token: string };

  const intake = await request.post(`/api/cases/${token}/intake`, {
    multipart: { description: text },
  });
  expect(intake.ok(), `intake for: ${text.slice(0, 40)}`).toBeTruthy();

  // Diagnose on the intake alone — no answers — so this measures the extractor and the
  // engine, not the question flow.
  const res = await request.post(`/api/cases/${token}/diagnose`, { data: {} });
  expect(res.ok(), 'diagnose').toBeTruthy();
  const body = (await res.json()) as {
    diagnosis: { band: string; ranked: { hypothesisId: string }[]; unknown?: unknown[] };
    actions: { title: string }[];
  };
  return { token, ...body };
}

test('ten messy transcripts land honestly', async ({ request }) => {
  const results: { name: string; band: string; top3: string[]; expected: string; hit: boolean }[] = [];

  for (const f of FIXTURES) {
    const { diagnosis } = await diagnoseFreeText(request, f.text);
    const top3 = diagnosis.ranked.slice(0, 3).map((r) => r.hypothesisId);
    results.push({
      name: f.name,
      band: diagnosis.band,
      top3,
      expected: f.expect,
      hit: f.expect === 'LOW' ? diagnosis.band === 'LOW' : top3.includes(f.expect),
    });
  }

  const named = results.filter((r) => r.expected !== 'LOW');
  const vague = results.filter((r) => r.expected === 'LOW');

  // At least eight of the ten name the right cause in the top three.
  expect(
    named.filter((r) => r.hit).length,
    named.map((r) => `${r.name}: wanted ${r.expected}, got ${r.top3.join(' > ')}`).join('\n'),
  ).toBeGreaterThanOrEqual(8);

  // The two that give us almost nothing must say so rather than guess.
  for (const r of vague) {
    expect(r.band, `${r.name} must not be confident`).toBe('LOW');
  }
});

test('a transcript with almost nothing in it gets a separating question, not a verdict', async ({ request }) => {
  const { token, diagnosis, actions } = await diagnoseFreeText(request, FIXTURES[8]!.text);
  expect(diagnosis.band).toBe('LOW');

  // LOW means one information-gathering step, and nothing that reads as an answer.
  expect(actions.length).toBe(1);
  expect(actions[0]!.title).toMatch(/^Find out:/);

  // And a real next question is waiting, so the student is never at a dead end.
  const q = await (await fetch(`http://localhost:3000/api/cases/${token}/questions`)).json();
  expect(q.nextQuestion, 'a LOW case must still have somewhere to go').toBeTruthy();
});
