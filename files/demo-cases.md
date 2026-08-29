# Demo Cases

Three seeded cases. A judge clicks **Run this case** on `/demo` and completes the journey without typing
anything real. Each is also an e2e test (`tests/e2e/demo-case-{1,2,3}.spec.ts`) with these exact
assertions.

Common: `POST /api/demo/seed {caseNo}` resets that case's `gov_*` rows, creates a case with
`is_demo=true`, injects the intake text as evidence, runs the normal intake pipeline, redirects to
`/case/[token]`.

---

## Case 1 — Sanctioned, payment returned: account not enabled for DBT

**The point of this case:** the account *is* Aadhaar-seeded but *not* DBT-enabled. This is the
distinction almost everyone conflates, including bank counter staff, and it is why the money bounced.

### Initial synthetic state
`NSP-DEMO-1001` sanctioned 2025-12-20 · payment `RETURNED` (`ACCOUNT_NOT_DBT_ENABLED`) ·
account `ACTIVE`, `aadhaar_seeded=true`, `dbt_enabled=false`.

### Injected intake (student's own words, Hinglish, deliberately messy)
> "portal pe December se sanctioned dikha raha hai, ₹23,000 ka post matric. college wale bol rahe hain
> unka kaam ho gaya. account me kuch nahi aaya abhi tak. mere do dost ko mil gaya. bank gaya tha to bola
> aadhaar link hai."
Plus a screenshot of a status table showing `SANCTIONED — Payment under process`.

### Expected extraction
| Fact | Value | Provenance |
|------|-------|-----------|
| `scheme_type` | `POST_MATRIC` | You told us |
| `portal_status_code` | `SANCTIONED` | Our estimate (screenshot) |
| `sanction_seen` | `YES` | You told us |
| `days_since_sanction` | `>60` | Our estimate |
| `institute_verified` | `YES` | You told us |
| `credit_seen` | `NO` | You told us |
| `peers_paid` | `YES` | You told us |
| `aadhaar_linked_to_account` | `YES` | You told us |
| `dbt_enabled_reported` | `UNKNOWN` | — |

The extractor must **not** set `dbt_enabled_reported=YES` from "aadhaar link hai". If it does, the case
fails. This is asserted in the test.

### Expected questions (max 3)
1. `Q_PFMS_LOOKUP` — "Have you looked up your payment on the payment-tracking page?" → **Shows returned**
2. `Q_DBT_STATUS` — "Has your bank told you the account is enabled for Aadhaar-based benefit payments,
   not just linked?" → **Linked but not for benefits**
3. Stopping rule fires (band `HIGH`).

### Expected diagnosis
- Top: `H_DBT_NOT_ENABLED`, confidence ≥ 0.65, band `HIGH`.
- Verdict text (model or fallback) says, in substance: the money was sent and came back because the
  account is linked to Aadhaar but not switched on for benefit payments.
- Journey: stages 1–6 `CONFIRMED`/`LIKELY`, **stage 7 `BLOCKED`**, stage 8 `NOT_REACHED`.
- Known: sanction date, payment returned, peers paid, account linked.
- Unknown: *"Whether your bank has now enabled it"* → how to find out: ask at the counter for the
  seeding/DBT status of the account.
- Other possibilities visible: `H_MAPPED_TO_OTHER_ACCOUNT` and `H_ACCOUNT_UNUSABLE`, each with
  "what would prove this".

### Expected action + artifact
Action 1: confirm at the branch. Artifact `BANK_DBT_REQUEST` generated, addressed to the Branch Manager,
containing the request to enable the account for Aadhaar-based benefit transfers and to give a dated
acknowledgement, with `[[your name]]`, `[[account number]]`, `[[date]]` placeholders and the closing line.

### Verification
Outcome chosen: **"Bank filled the form and enabled it"** → `BANK_SEEDED_DBT` →
`dbt_enabled=true`, payment queued `PROCESSED` at simulated +2 days.
Press **Check again** → simulated time advances → payment `PROCESSED`, UTR present.

### Final outcome
`RESOLVED`. Rail shows all 8 stages confirmed. Credit line renders
`₹23,000 · <simulated date> · account ending 4417` with a `Demo record` badge and the caption
*"This is a simulated credit in our demo records. No real payment happened."*
Case summary downloadable.

---

## Case 2 — Sanctioned, but no payment was ever initiated

**The point of this case:** nothing is wrong with the student or the bank. The block is upstream and
invisible, and the only real lever is a paper trail plus escalation. This is the case that proves the
product does not just blame the citizen.

### Initial synthetic state
`NSP-DEMO-1002` sanctioned 2025-12-05 · payment `NO_RECORD` · account healthy and DBT-enabled.

### Injected intake
> "My post-matric scholarship shows sanctioned since 5 December but no money. My account is fine, I get
> other payments in it. Nobody in my class has received this year's scholarship. College says it is not
> in their hands now."

### Expected extraction
`sanction_seen=YES`, `days_since_sanction=>60`, `credit_seen=NO`, `peers_paid=NO`,
`account_status_reported=ACTIVE`, `institute_verified=YES`.

### Expected questions
1. `Q_PFMS_LOOKUP` → **No record found**
2. Stopping rule fires (band `HIGH` or high `MEDIUM`).

### Expected diagnosis
- Top: `H_PAYMENT_NOT_INITIATED` (supported by `NO_RECORD` weight 2.8 and `peers_paid=NO` weight 1.5).
- Journey: stages 1–4 `CONFIRMED`, **stage 5 `BLOCKED`**, 6–8 `NOT_REACHED`.
- Unknown block must include *"Whether the sanction has been sent onward for payment, and on what date"*
  with how-to-find-out = ask the college nodal officer for the onward reference.
- The product must **not** claim to know which office holds it. Asserted by a test that scans the verdict
  and artifact bodies for desk/officer-location phrases.

### Expected action + artifacts
1. Ask the nodal officer for the sanction reference and onward date.
2. `INSTITUTE_FOLLOWUP` letter generated.
3. If outcome is "no useful reply": `PORTAL_GRIEVANCE` generated.
4. Then `RTI_DRAFT` with the four questions from `workflows.md` §7.

### Verification
Outcome: **"College replied but could not give a payment reference"** → `NOTHING_HAPPENED` →
result `NO_CHANGE` → escalation offered.
Judge clicks **Escalate** → rung moves `INSTITUTE → STATE_NODAL`, `PORTAL_GRIEVANCE` artifact generated,
escalation dated.
Second escalation → `RTI` rung with the RTI draft.

### Final outcome
`ESCALATED`, not `RESOLVED` — deliberately. The screen shows the ladder with two rungs completed and
dates recorded, plus the honest line: *"This is as far as anyone outside the department can go. What you
now have is a dated paper trail, which is what the next authority needs."*

---

## Case 3 — Payment bounced: dormant account, with a name mismatch as runner-up

**The point of this case:** two plausible causes, and the product handles the ambiguity honestly instead
of picking one confidently.

### Initial synthetic state
`NSP-DEMO-1003` sanctioned 2025-12-12 · payment `RETURNED` (`ACCOUNT_INACTIVE`) ·
account `DORMANT`, `name_on_account='SANA RAHMAN'` vs application `'SANA R.'`.

### Injected intake
> "Scholarship approved in December, ₹26,000. I gave my old account from school days, I haven't used it
> in maybe two years. Also my name is short form on the college records. Money not received."

### Expected extraction
`sanction_seen=YES`, `credit_seen=NO`, `account_status_reported=DORMANT` (from "haven't used it in two
years" — this is a legitimate inference and must be badged `Our estimate`, editable),
`name_matches_bank=UNKNOWN` (the student said the name is a short form, but not whether it differs at the
bank — the extractor must not resolve this).

### Expected questions
1. `Q_PFMS_LOOKUP` → **Shows returned**
2. `Q_ACCOUNT_ACTIVE` → **Not used for over a year**
3. `Q_NAME_MATCH` → **Not sure**

### Expected diagnosis
- Top: `H_ACCOUNT_UNUSABLE`, band `MEDIUM` (not `HIGH` — the name question is unresolved).
- Runner-up `H_NAME_MISMATCH` rendered prominently, not collapsed, with
  "what would prove this: the bank tells you the name on the account differs from the application".
- Journey: stage 7 `CONFIRMED` (routing worked — the payment reached the bank), **stage 8 `BLOCKED`**.
- Unknown block includes the name question with a concrete how-to-find-out.

### Expected action + artifact
1. Reactivate the account at the branch — `BANK_REACTIVATION_REQUEST`.
2. While there, ask the counter to read out the name on the account and compare it to the application
   print (this single step resolves the runner-up too — the action plan is designed to collapse both
   hypotheses in one visit; call this out in the UI: *"This one visit answers both possibilities."*).
3. Inform the college so the payment is re-attempted.

### Verification
Outcome: **"Account reactivated, and the name is different"** →
`ACCOUNT_REACTIVATED` + `NAME_CORRECTED` → payment queued `PROCESSED` at +3 days →
**Check again** → `RESOLVED`.

Alternate branch the judge can take: **"Account reactivated, name is the same"** → `ACCOUNT_REACTIVATED`
only → payment `PROCESSED` at +2 days → `RESOLVED`. Both branches must work.

### Final outcome
`RESOLVED` with a rail where stage 8 flips from `BLOCKED` to `CONFIRMED`, and the timeline showing the
name-mismatch hypothesis being closed out by evidence rather than by guesswork.

---

## Judge guide (rendered on `/demo`)

| Case | Click path | Time | What to look for |
|------|-----------|------|------------------|
| 1 | Run → Continue → 2 answers → See what to do → Generate letter → Mark done → Verify → Check again | ~90s | The seeded-vs-enabled distinction; the blocked stage on the rail |
| 2 | Run → Continue → 1 answer → See what to do → Generate follow-up → Mark done → Verify → Escalate ×2 | ~2 min | That it ends in an honest escalation, not a fake resolution |
| 3 | Run → Continue → 3 answers → See what to do → Generate letter → Mark done → Verify → Check again | ~2 min | Two live hypotheses; one visit designed to resolve both |

Also on `/demo`: a **"Try it with your own words"** box that creates a non-seeded case from free text, so
a judge can test the extractor on something we didn't write. This is the riskiest demo and therefore the
most convincing one — make sure the `LOW` band path is good, because unfamiliar input often lands there,
and landing there gracefully *is* the product.
