# Workflows: State Machine, Rules Engine, Actions

Everything in this file is **deterministic and unit-tested**. No model call appears in any of it.

## 1. Case state machine (`lib/engine/machine.ts`)

```
NEW ──intake received──> INTAKE ──facts extracted──> EXTRACTED
EXTRACTED ──has open question──> QUESTIONING
EXTRACTED ──no useful question──> DIAGNOSED
QUESTIONING ──answer, stop rule fires──> DIAGNOSED
QUESTIONING ──answer, more to ask──> QUESTIONING
DIAGNOSED ──actions issued (automatic)──> ACTION_PLANNED
ACTION_PLANNED ──≥1 action completed──> AWAITING_VERIFICATION
AWAITING_VERIFICATION ──verify submitted──> VERIFYING
VERIFYING ──result RESOLVED──> RESOLVED
VERIFYING ──result PROGRESSED──> ACTION_PLANNED      (new action set)
VERIFYING ──result NO_CHANGE──> ESCALATED            (on user confirm) | ACTION_PLANNED (retry)
VERIFYING ──result NEEDS_MORE_INFO──> QUESTIONING
Any ──user edits a fact──> re-enter QUESTIONING (answers after the affected question invalidated)
Any ──7 days idle──> ABANDONED (retention sweep deletes)
```

Guards:
- `ACTION_PLANNED → AWAITING_VERIFICATION` requires at least one `actions.completed_at`.
- `→ RESOLVED` requires a `VERIFYING` run whose journey has stage 8 `CONFIRMED`. There is no other path
  to `RESOLVED`; the UI cannot set it.
- Every transition writes an `events` row with the from/to states.

`transition(case, event)` returns `{nextState, effects[]}` and throws `InvalidTransition` on an illegal
pair. Exhaustively tested (`tests/unit/machine.spec.ts`) including every illegal pair.

## 2. The eleven hypotheses (`lib/engine/hypotheses.ts`)

These are the distinct failure states. They look identical to the student — that is the whole problem.

| id | Label (student-facing) | Where on the rail | Who must act |
|----|------------------------|-------------------|--------------|
| `H_APPLICATION_DEFECTIVE` | Your application was marked incomplete or defective | Stage 1 | You + college |
| `H_INSTITUTE_PENDING` | Your college has not verified it yet | Stage 2 | College nodal officer |
| `H_STATE_PENDING` | It is waiting with the state / ministry | Stage 3 | State nodal officer |
| `H_SANCTION_NOT_ISSUED` | It looks approved to you, but no sanction has been issued | Stage 4 | Scheme department |
| `H_PAYMENT_NOT_INITIATED` | Sanctioned, but the payment instruction has not been sent yet | Stage 5 | Scheme department / treasury |
| `H_PAYMENT_STUCK_AT_AGENCY` | The payment is sitting in the payment system, not yet processed | Stage 6 | Scheme department |
| `H_DBT_NOT_ENABLED` | Your account is not enabled to receive Aadhaar-based benefit payments | Stage 7 | You + your bank |
| `H_MAPPED_TO_OTHER_ACCOUNT` | Your Aadhaar is pointing at a different (probably older) account | Stage 7 | You + the bank holding the mapping |
| `H_ACCOUNT_UNUSABLE` | Your account is dormant, closed, or limited, so the credit bounced | Stage 8 | You + your bank |
| `H_NAME_MISMATCH` | The name on the application and on the bank account do not match | Stage 8 | You + college/bank |
| `H_ALREADY_PAID_UNSEEN` | The money has already gone somewhere you haven't checked | Stage 8 | You |

Plus the meta-outcome `H_INSUFFICIENT_INFO`, which is not a hypothesis but the band `LOW` result.

Each hypothesis object:

```ts
{
  id, label, stage, prior,                 // prior: 0..1, sums to ~1 across hypotheses
  supports: Partial<Record<FactKey, {value: string; weight: number}[]>>,
  contradicts: Partial<Record<FactKey, {value: string; weight: number}[]>>,
  requires?: Partial<Record<FactKey, string[]>>,   // hard gate: if fact present and not in list, score = 0
  disproveBy: string[],                    // "what would rule this out", shown in UI
  actionKey: string                        // -> lib/engine/actions.ts
}
```

### Priors (sum 1.00, documented, tunable in one place)

Priors are **product judgement, not measured frequencies** — label them as such in `/about`.

```
H_DBT_NOT_ENABLED        0.20
H_PAYMENT_NOT_INITIATED  0.16
H_INSTITUTE_PENDING      0.12
H_ACCOUNT_UNUSABLE       0.10
H_MAPPED_TO_OTHER_ACCOUNT 0.09
H_STATE_PENDING          0.08
H_PAYMENT_STUCK_AT_AGENCY 0.08
H_NAME_MISMATCH          0.06
H_ALREADY_PAID_UNSEEN    0.05
H_SANCTION_NOT_ISSUED    0.04
H_APPLICATION_DEFECTIVE  0.02
```

### Example evidence table (implement all eleven the same way)

`H_DBT_NOT_ENABLED`
```ts
supports: {
  dbt_enabled_reported:      [{value:'NO', weight: 3.0}],
  payment_system_result:     [{value:'RETURNED', weight: 1.6}, {value:'PROCESSED', weight: 1.2}],
  aadhaar_linked_to_account: [{value:'NO', weight: 1.4}],
  peers_paid:                [{value:'YES', weight: 0.8}],
  portal_status_code:        [{value:'SANCTIONED', weight: 0.6}],
},
contradicts: {
  dbt_enabled_reported: [{value:'YES', weight: 2.5}],
  credit_seen:          [{value:'YES', weight: 3.0}],
  payment_system_result:[{value:'NO_RECORD', weight: 1.5}],
},
requires: { sanction_seen: ['YES','UNKNOWN'] },
disproveBy: [
  'Your bank confirms the account is enabled for Aadhaar-based benefit payments',
  'The payment system shows no payment record at all for your application'
]
```

`H_PAYMENT_NOT_INITIATED`
```ts
supports: {
  payment_system_result: [{value:'NO_RECORD', weight: 2.8}, {value:'PENDING', weight: 2.0}],
  peers_paid:            [{value:'NO', weight: 1.5}],
  days_since_sanction:   [{value:'<45', weight: 0.8}],
},
contradicts: {
  payment_system_result: [{value:'RETURNED', weight: 2.5}, {value:'PROCESSED', weight: 2.5}],
  credit_seen:           [{value:'YES', weight: 3.0}],
},
requires: { sanction_seen: ['YES','UNKNOWN'] }
```

## 3. Scoring (`lib/engine/diagnose.ts`)

```
for each hypothesis h:
  if any requires-gate violated -> score = 0, skip
  logit = ln(prior / (1 - prior))
  for each fact f with value v (non-UNKNOWN):
      logit += weight(h.supports[f.key][v])      if matched
      logit -= weight(h.contradicts[f.key][v])   if matched
  raw[h] = sigmoid(logit)
confidence[h] = raw[h] / sum(raw)          // normalise to a distribution
```

Range predicates (`'<45'`, `'>90'`) are evaluated by a small comparator for numeric facts.
`UNKNOWN` contributes nothing — never treat absence as evidence.

**Confidence bands:**

| Band | Condition | UI behaviour |
|------|-----------|--------------|
| `HIGH` | `top ≥ 0.65` **and** `top - second ≥ 0.25` | "Fairly confident", single verdict |
| `MEDIUM` | `top ≥ 0.40` | "Possible", verdict + prominent runner-up |
| `LOW` | otherwise | "Not enough information yet", two possibilities side by side, action = the one check that separates them |

`engine_version` string is stamped on every diagnosis so results are reproducible.

**Golden tests:** `tests/unit/diagnose.spec.ts` contains a fixture table of 20 fact-sets → expected top
hypothesis and band. Changing weights without updating the table fails CI.

## 4. Question bank and selection (`lib/engine/questions.ts`)

Each question resolves one or more fact keys. Selection is by **expected information gain**: for each
candidate question, for each possible answer, recompute the distribution and take the probability-weighted
reduction in entropy; pick the highest. Ties broken by `cost` (how hard it is for the student to answer:
`0` = knows now, `1` = must look at passbook/app, `2` = must ask college or bank).

| id | Prompt (template) | Resolves | Options | Cost |
|----|-------------------|----------|---------|------|
| `Q_CREDIT_SEEN` | Have you checked your bank passbook or app in the last week? | `credit_seen`, `passbook_checked_recently` | Yes, nothing came / Yes, something came / Not checked | 1 |
| `Q_STATUS_CODE` | What does the portal show right now? | `portal_status_code` | Sanctioned / Under process / Defective / Verified by college / Something else | 0 |
| `Q_DAYS_SINCE` | Roughly how long has it shown that status? | `days_since_sanction` | Under 1 month / 1–3 months / Over 3 months / Not sure | 0 |
| `Q_PFMS_LOOKUP` | Have you looked up your payment on the payment-tracking page? | `payment_system_result` | No record found / Shows processed / Shows returned / Haven't checked | 1 |
| `Q_DBT_STATUS` | Has your bank told you your account is enabled for Aadhaar-based benefit payments? | `dbt_enabled_reported`, `aadhaar_linked_to_account` | Yes, enabled / No, not enabled / Linked but not for benefits / Don't know | 2 |
| `Q_ACCOUNT_ACTIVE` | Is the account you gave still in normal use? | `account_status_reported` | Yes, I use it / Not used for over a year / It's closed / Don't know | 1 |
| `Q_ACCOUNT_CHANGED` | Did you open a new account or change banks after applying? | `account_changed_since_application`, `multiple_accounts` | Yes / No / Not sure | 0 |
| `Q_NAME_MATCH` | Is your name spelled the same on the application and in the bank? | `name_matches_bank` | Same / Different / Not sure | 1 |
| `Q_INSTITUTE` | Has your college confirmed they verified it? | `institute_verified` | Yes, they said done / No / Told me to wait / Don't know | 2 |
| `Q_PEERS` | Have classmates on the same scholarship been paid? | `peers_paid` | Yes, most got it / No, nobody got it / Don't know | 0 |
| `Q_DEADLINE` | Is there a fee deadline you're worried about? | `fee_deadline_pressure` | Yes / No | 0 |

Each question also carries `howToCheck` steps (badged `Public rule`) where the answer requires a lookup —
e.g. how to check bank seeding status at the bank counter, what to ask the college nodal officer.

**Stopping rule:** stop when band is `HIGH`, or 5 questions asked, or no remaining question changes the
top hypothesis under any answer (`maxGain < 0.02`), or the student skipped 3 in a row.

**Answer → fact mapping** is a static table. `DONT_KNOW` and `SKIPPED` write `UNKNOWN` (which contributes
nothing) and mark the question as asked so it is never repeated.

## 5. Journey construction (`lib/engine/journey.ts`)

Input: facts + top hypothesis + (after verification) mock service responses.
Output: 8 stages, each `{stageId, label, status, provenance, note?}`.

Rules:
- A stage is `CONFIRMED` only if a fact or a mock record directly attests it (`provenance` set accordingly).
- Stages before the top hypothesis's stage are `LIKELY` if implied, never `CONFIRMED` without attestation.
- The top hypothesis's stage is `BLOCKED`.
- Stages after it are `NOT_REACHED`.
- Any stage with no attestation and no implication is `UNKNOWN` with a dashed connector.
- In band `LOW`, no stage is `BLOCKED`; the two candidate stages both render `UNKNOWN` with the note
  *"One of these two — we can't tell yet."*

## 6. Action plans (`lib/engine/actions.ts`)

One plan per hypothesis. Each step:

```ts
{ key, seq, title, doThis, where, takeWith: string[], expect, typicalTime, artifactType?, outcomes: Outcome[] }
```

`Outcome` = `{id, label, mockAction}` — the outcomes shown on the verification screen.

### `H_DBT_NOT_ENABLED` (the flagship plan)

1. **Confirm what your bank has on record** — `Q`: go to your branch, ask whether the account is
   *seeded and enabled for Aadhaar-based benefit transfers*. Take with: passbook, ID, application print.
   Expect: they check and tell you enabled / not enabled / linked but not enabled. Typical time: one visit.
   Artifact: `BANK_DBT_REQUEST`.
   Outcomes: `SEEDED_NOW`→`BANK_SEEDED_DBT`, `ALREADY_ENABLED`→`NOTHING_HAPPENED`,
   `REFUSED`→`NOTHING_HAPPENED`, `NOT_DONE_YET`→`NOTHING_HAPPENED`.
2. **Give the bank the written request** (the generated letter) and ask for an acknowledgement with a date.
3. **Tell your college nodal officer** that the account is now enabled, so the payment can be re-pushed.
   Artifact: `INSTITUTE_FOLLOWUP`. Outcome `INFORMED`→`PAYMENT_REPUSHED`.
4. **Check again after 7 working days** → verification.

### `H_PAYMENT_NOT_INITIATED`
1. Ask the college nodal officer for the sanction/payment reference and the date it was sent onward.
2. Send the written follow-up (`INSTITUTE_FOLLOWUP`); if no reply in 7 days →
3. File the portal grievance (`PORTAL_GRIEVANCE`) with the reference; if no useful reply in 30 days →
4. RTI to the state nodal officer (`RTI_DRAFT`) asking the four specific questions in §7.

### `H_ACCOUNT_UNUSABLE`
1. Check account status at the branch (dormant / closed / limited).
2. Reactivate or complete KYC (`BANK_REACTIVATION_REQUEST`); if closed, provide a new account and get it
   Aadhaar-enabled, then update it on the portal/college.
3. Inform the college so the payment is re-attempted.

### `H_MAPPED_TO_OTHER_ACCOUNT`
1. Check which bank currently holds the Aadhaar mapping (public method, `Public rule` badge).
2. Either check that older account for the credit, or ask the bank you want to receive it to update the
   mapping (`BANK_DBT_REQUEST`, variant "move the mapping").
3. Inform the college.

### `H_INSTITUTE_PENDING` / `H_STATE_PENDING` / `H_APPLICATION_DEFECTIVE` / `H_SANCTION_NOT_ISSUED`
Follow-up → written follow-up → grievance → RTI, with the recipient changing per rung.

### `H_ALREADY_PAID_UNSEEN`
1. Check the older/other account's statement for the specific window.
2. If found, done. If not, return and answer the DBT question — the case re-enters diagnosis.

### `H_INSUFFICIENT_INFO` (band LOW)
A single step: the one check with the highest information gain, with `howToCheck` steps and a "come back
and tell us" button that returns to questions.

## 7. Artifacts (`lib/engine/artifacts.ts` + `lib/ai/draft.ts`)

| Type | Recipient | Contains |
|------|-----------|----------|
| `BANK_DBT_REQUEST` | Branch Manager | Request to seed the account with Aadhaar and enable it for benefit transfers; request written acknowledgement with date |
| `BANK_REACTIVATION_REQUEST` | Branch Manager | Request to reactivate a dormant account / complete KYC; note that a benefit credit is expected |
| `INSTITUTE_FOLLOWUP` | College nodal officer | Application reference, current portal status, what the student has done, three specific asks (verification date, onward reference, who to contact next) |
| `PORTAL_GRIEVANCE` | Scheme helpdesk | Under 150 words, the reference numbers, the timeline, the specific question |
| `RTI_DRAFT` | Public Information Officer, state nodal department | Four questions about the applicant's own application: (1) current stage and date it reached that stage, (2) whether a payment instruction was issued and when, (3) if it was returned, the reason recorded, (4) the name/designation of the officer currently responsible |
| `CASE_SUMMARY` | The student | Everything: facts, diagnosis, confidence, what was tried, dates, provenance table |

Every artifact ends with `Prepared with Scholarship Saathi, an independent prototype.` and, in the UI,
sits under the line *"Draft for you to send. Not submitted."*

## 8. Verification (`lib/engine/verify.ts`)

```
input: previous journey, outcome id, mock service responses AFTER applyRealWorldAction
1. recompute journey from the fresh mock records
2. compare stage-by-stage:
   - stage 8 now CONFIRMED                                -> RESOLVED
   - any stage advanced (UNKNOWN/BLOCKED -> CONFIRMED)    -> PROGRESSED
   - no stage changed, and a new unknown was introduced   -> NEEDS_MORE_INFO
   - no stage changed                                     -> NO_CHANGE
3. on PROGRESSED: re-run diagnosis on updated facts, issue the next action set
4. on NO_CHANGE: offer the next escalation rung
```

Mock timing: `BANK_SEEDED_DBT` sets `dbt_enabled=true` immediately and marks the payment
`PROCESSED` with a UTR dated **+2 days** in simulated time, so the demo can show the credit without
pretending it was instantaneous. The UI labels the date `Demo record`.

## 9. Escalation ladder (`lib/engine/escalation.ts`)

**Scheme side:** `INSTITUTE → STATE_NODAL → PORTAL_HELPDESK → MINISTRY → PUBLIC_GRIEVANCE → RTI`
**Bank side:** `BANK_BRANCH → BANK_NODAL → BANK_OMBUDSMAN`

Which ladder applies is decided by the top hypothesis's `whoMustAct`. Each rung has: label, what this
rung can actually do, what to send (artifact type), how long to wait before the next rung, and the
`Public rule` note that wait periods and the ombudsman route are publicly documented — with the honest
caveat that exact timelines vary by scheme and state and the student should check the current rule.
Never state a legal deadline as if we verified it for their specific scheme; phrase as "commonly
published waiting period" and link to nothing we cannot cite.

Recording an escalation stores the date so the `CASE_SUMMARY` can show elapsed time — which is what makes
the next rung actionable.
