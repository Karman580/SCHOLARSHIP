# Mock Government Systems

**Nothing in this file touches a real system.** These are synthetic services that behave *shaped like*
the real ones so the architecture is genuine and the integration boundary is visible. Every response is
flagged `simulated: true` and every UI element that displays one carries the `Demo record` badge.

## 1. Why they exist

The hackathon forbids connecting to live government systems. But an app that only explains things has no
backend story. So we build the four systems as separate HTTP services with their own records and their
own failure modes, and the engine talks to them exactly as it would talk to real ones. Swapping them for
real integrations is then a change of base URL and auth, not a rewrite — which is the end-to-end
argument we make to judges.

```
lib/engine  ──► lib/gov-mock/client.ts ──► /api/gov/{nsp,pfms,npci,bank}  ──► gov_* tables
                       ▲
        the only seam that would be replaced in production
```

`lib/gov-mock/client.ts` is the single integration seam. It exposes
`getApplication`, `getPayment`, `getMapping`, `getAccount` and is the only module allowed to know the
`/api/gov` URLs. Document in the file header: *"In production this module would be replaced by
authenticated clients for the corresponding real systems, subject to an approved sandbox."*

## 2. The four services

| Service | Real-world analogue | What it models | What it deliberately does NOT model |
|---------|--------------------|----------------|-------------------------------------|
| `nsp` | A national/state scholarship portal | Application, verification timestamps, sanction, the status *text* a student sees | Login, application filing, document upload |
| `pfms` | A public financial management / payment system | Whether a payment record exists, its status, return reason, UTR | Treasury accounting, budget heads |
| `npci` | An Aadhaar-to-bank routing mapper | Which bank an alias maps to, whether DBT is enabled | Aadhaar numbers (we use a synthetic `aliasKey`, never a 12-digit value) |
| `bank` | A bank core system | Account status, name on account, seeding and DBT flags | Balances, transactions, KYC documents |

**We never model Aadhaar itself.** There is no Aadhaar number anywhere in the codebase, seed data,
fixtures or tests. `aliasKey` values look like `ALIAS-DEMO-A`.

## 3. Seed data (`lib/gov-mock/seed.ts`)

Three applications, one per demo case. All names are fictional and labelled `(demo)`.

```ts
// CASE 1 — sanctioned, payment returned because the account is not DBT-enabled
gov_applications: {
  application_id: 'NSP-DEMO-1001', student_alias: 'Priya K. (demo)',
  scheme: 'Post-Matric Scholarship (demo scheme)', academic_year: '2025-26',
  amount_paise: 2300000,                               // ₹23,000
  institute_verified_at: '2025-11-18', state_verified_at: '2025-12-02',
  sanctioned_at: '2025-12-20',
  portal_status_text: 'Application Status: SANCTIONED — Payment under process',
  bank_ref_id: 'BANK-DEMO-A'
}
gov_payments: { payment_id:'PAY-DEMO-1001', application_id:'NSP-DEMO-1001',
  status:'RETURNED', processed_at:'2026-01-08', return_reason:'ACCOUNT_NOT_DBT_ENABLED', utr:'UTRDEMO0001' }
gov_aadhaar_mapping: { mapping_id:'MAP-DEMO-A', alias_key:'ALIAS-DEMO-A',
  mapped_bank:'Demo Bank of India', dbt_enabled:false, last_updated:'2024-07-02' }
gov_bank_accounts: { bank_ref_id:'BANK-DEMO-A', bank_name:'Demo Bank of India',
  account_masked:'XXXXXX4417', account_status:'ACTIVE', name_on_account:'PRIYA K',
  aadhaar_seeded:true, dbt_enabled:false }
```

Note the deliberate subtlety in Case 1: the account **is** Aadhaar-seeded but **not** DBT-enabled. That
distinction is the thing students and even bank counter staff conflate, and it is why the product asks
two separate questions. Make sure the demo surfaces it explicitly.

```ts
// CASE 2 — sanctioned, but no payment record exists at all
gov_applications: {
  application_id:'NSP-DEMO-1002', student_alias:'Arjun M. (demo)',
  scheme:'Post-Matric Scholarship (demo scheme)', academic_year:'2025-26',
  amount_paise:1800000, institute_verified_at:'2025-10-30', state_verified_at:'2025-11-25',
  sanctioned_at:'2025-12-05',
  portal_status_text:'Application Status: SANCTIONED', bank_ref_id:'BANK-DEMO-B'
}
gov_payments: { payment_id:null, application_id:'NSP-DEMO-1002', status:'NO_RECORD',
  processed_at:null, return_reason:null, utr:null }
gov_aadhaar_mapping: { mapping_id:'MAP-DEMO-B', alias_key:'ALIAS-DEMO-B',
  mapped_bank:'Demo Grameen Bank', dbt_enabled:true, last_updated:'2025-08-11' }
gov_bank_accounts: { bank_ref_id:'BANK-DEMO-B', bank_name:'Demo Grameen Bank',
  account_masked:'XXXXXX9021', account_status:'ACTIVE', name_on_account:'ARJUN M',
  aadhaar_seeded:true, dbt_enabled:true }
```

```ts
// CASE 3 — payment attempted, bounced: account dormant + name mismatch
gov_applications: {
  application_id:'NSP-DEMO-1003', student_alias:'Sana R. (demo)',
  scheme:'Post-Matric Scholarship (demo scheme)', academic_year:'2025-26',
  amount_paise:2600000, institute_verified_at:'2025-11-05', state_verified_at:'2025-11-28',
  sanctioned_at:'2025-12-12',
  portal_status_text:'Application Status: SANCTIONED — Amount released', bank_ref_id:'BANK-DEMO-C'
}
gov_payments: { payment_id:'PAY-DEMO-1003', application_id:'NSP-DEMO-1003',
  status:'RETURNED', processed_at:'2026-01-02', return_reason:'ACCOUNT_INACTIVE', utr:'UTRDEMO0003' }
gov_aadhaar_mapping: { mapping_id:'MAP-DEMO-C', alias_key:'ALIAS-DEMO-C',
  mapped_bank:'Demo Co-operative Bank', dbt_enabled:true, last_updated:'2023-02-19' }
gov_bank_accounts: { bank_ref_id:'BANK-DEMO-C', bank_name:'Demo Co-operative Bank',
  account_masked:'XXXXXX7734', account_status:'DORMANT', name_on_account:'SANA RAHMAN',
  aadhaar_seeded:true, dbt_enabled:true }
```

Case 3's application carries `name_on_application: 'SANA R.'` in the app fixture so the name-mismatch
hypothesis is live but *not* the top one — it is the runner-up, which lets the demo show the
"other possibilities" block doing real work.

The seed script is **idempotent** and resets these rows to the values above on every run, so a judge can
re-run a demo case cleanly.

## 4. Service behaviour

Each `/api/gov/*` route:
- reads only from `gov_*` tables,
- returns `simulated: true` and header `X-Saathi-Simulated: true`,
- returns `{simulated:true, found:false}` with HTTP 200 for unknown ids,
- adds a random 150–450ms delay so the UI's loading states are exercised honestly,
- fails 0% of the time by default; set `MOCK_FAILURE_RATE=0.1` to exercise the `UNKNOWN` path in testing.

Response example:

```json
{
  "simulated": true,
  "disclaimer": "Synthetic record from a prototype. Not a government record.",
  "applicationId": "NSP-DEMO-1001",
  "statusCode": "SANCTIONED",
  "portalStatusText": "Application Status: SANCTIONED — Payment under process",
  "instituteVerifiedAt": "2025-11-18",
  "stateVerifiedAt": "2025-12-02",
  "sanctionedAt": "2025-12-20",
  "amountPaise": 2300000
}
```

The `disclaimer` field is required by schema. If it is missing, the client throws — so a real API could
never be silently swapped in behind a UI that claims to be simulated.

## 5. Outcome → mutation map (`lib/gov-mock/mutate.ts`)

This is what makes verification real inside the prototype: the student's completed action changes the
synthetic world, and the next check reads the changed world.

| Verification outcome | `MockAction` | Effect on records |
|----------------------|--------------|-------------------|
| Bank enabled the account for benefit payments | `BANK_SEEDED_DBT` | `gov_bank_accounts.dbt_enabled=true`; `gov_aadhaar_mapping.dbt_enabled=true`, `last_updated=now`; queue `gov_payments.status='PROCESSED'`, `processed_at=now+2d`, new `utr` |
| Bank reactivated the account | `ACCOUNT_REACTIVATED` | `account_status='ACTIVE'`; queue payment `PROCESSED` at now+2d |
| Name corrected in bank/college records | `NAME_CORRECTED` | `name_on_account` set to the application name; queue payment `PROCESSED` at now+3d |
| Gave a new account and had it enabled | `NEW_ACCOUNT_PROVIDED` | new `gov_bank_accounts` row, mapping points to it, `dbt_enabled=true`; queue payment `PROCESSED` at now+5d |
| College confirmed and completed verification | `INSTITUTE_VERIFIED` | `institute_verified_at=now`; if state already verified, `sanctioned_at=now+7d` |
| Department re-pushed the payment | `PAYMENT_REPUSHED` | `gov_payments.status='PROCESSED'`, `processed_at=now+2d` |
| Nothing happened / counter refused / not done yet | `NOTHING_HAPPENED` | no change (drives `NO_CHANGE` → escalation) |

"Queue at now+Nd" is implemented as a `processed_at` in simulated future time plus a `simulatedNow`
offset stored on the case, so pressing **Check again** in the demo advances simulated time and the credit
appears. The UI says: *"Demo time moved forward to show what happens after a few days."* Never pretend
real time passed.

## 6. Provenance mapping (enforced)

| Source | Provenance | Badge |
|--------|-----------|-------|
| `gov_*` via `/api/gov/*` | `SIMULATED` | Demo record |
| Student's typed answer or edit | `USER_STATED` | You told us |
| Model extraction from text/screenshot | `AI_INFERENCE` | Our estimate |
| Rule text in the question bank, action steps, escalation notes | `PUBLIC_RULE` | Public rule |

A `SIMULATED` fact may never be presented without its badge. Test:
`tests/e2e/provenance.spec.ts` asserts that on every route, the count of rendered fact rows equals the
count of rendered provenance badges.

## 7. What we would need in production (put this on `/about` verbatim)

- An approved sandbox or API access to the scholarship portal for application and sanction status.
- An approved integration with the payment system for payment record and return reason.
- A bank-side or routing-layer status check for account seeding and DBT enablement, or a
  student-consented lookup.
- A verified identity flow, which this prototype deliberately does not implement.

Until those exist, this app is a **diagnostic and drafting assistant** operating on what the student can
see and tell us — and it says so on every screen.
