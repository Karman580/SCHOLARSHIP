# Product

## 1. The citizen problem

> A scholarship student's application shows **"sanctioned" / "approved"** on the scholarship portal,
> but the money has not reached their bank account. The portal's status stops at sanction. The failure,
> if there is one, happened in a different system the student cannot see. The student cannot tell
> whether nobody has paid yet, whether payment was attempted and bounced, whether their bank account is
> the problem, or whether the money already arrived in an account they stopped checking.

### Why it exists (root cause)

The citizen-facing portal, the payment system and the routing layer are **separate systems with separate
truth**, and only the first one talks to the student:

```
Student ──sees──> Scholarship portal (application + sanction status)
                        │  hands over payment instruction
                        ▼
                  Payment system (treasury/PFMS-type)     ← student sees nothing
                        │  routes by Aadhaar-linked account
                        ▼
                  Aadhaar→bank routing layer (NPCI-type)  ← student sees nothing
                        │
                        ▼
                  Bank account (active? name match? DBT-enabled?)  ← student sees only a passbook
```

Sanction status is **optimistic**: it is set when the sanction is issued, not when money lands. Every
downstream failure is silent from the student's side.

### Evidence base (carried from the research, do not overstate)

- A CAG performance audit of a state Post-Matric Scholarship DBT programme (Report No. 2 of 2023, Odisha)
  found **2,41,870 beneficiary bank accounts not Aadhaar-seeded**, with a dedicated section on
  *management of failed transactions* (dormant/inactive accounts, credits to incorrect accounts).
  **Do not quote a percentage** — the denominator is unverified in our sources.
- A state tribal-welfare notification recorded **1,983 ST students** rejected under the DBT error reasons
  *"UID never enabled for DBT"* and *"UID disabled for DBT"*.
- State-level press reporting has described lakh-scale scholarship non-payment episodes; treat those as
  **secondary estimates**, label them as such, and never present them as national totals.
- There is **no single national statistic** isolating "N scholarship payments failed due to Aadhaar/NPCI".
  Say so on the About page. Refusing to inflate the number is part of the honesty score.

## 2. What Scholarship Saathi does

It converts *"approved but no money, and I don't know why"* into:

1. a **named, ranked set of likely blockers** with honest confidence,
2. an explicit **"what we don't know and how you can find out"** list,
3. a **specific next action** the student can actually perform this week,
4. a **ready-to-send artifact** (bank request letter, institute follow-up, portal grievance, RTI draft),
5. a **verification step** that updates the case, and
6. **resolution or a named escalation** with the next authority in the ladder.

## 3. What it explicitly does not do

- It does not read any real government record. It cannot.
- It does not submit anything anywhere. It produces text the student sends themselves.
- It does not move money, change a government record, or file a grievance on the student's behalf.
- It does not ask for Aadhaar numbers, full bank account numbers, OTPs, or passwords — and it rejects
  them if pasted (see `safety-and-honesty.md` §Redaction).
- It does not promise the money will arrive.

## 4. Users

| User | Context | What they need |
|------|---------|----------------|
| Primary: scholarship student | Phone, patchy data, deadline pressure (fee due), first-generation portal user | To know *who to go to on Monday* and *what to say* |
| Secondary: college nodal/INO staff | Desktop | To see a clean summary of what the student has already checked |
| Judge | Desktop, 4 minutes, sceptical | To reach a resolved case without typing anything real |

## 5. Scope for the prototype

**In scope**
- Post-Matric-style scholarship payment failures on a national-portal-shaped flow.
- Free-text intake, pasted status text, and screenshot upload.
- Adaptive questioning, ranked diagnosis, action plan, artifact generation, verification, escalation.
- Three seeded demo cases.
- English + Hindi output for diagnosis, action steps and artifacts.

**Out of scope (state it, don't build it)**
- Real portal integration of any kind.
- Application *filing* (we start after the student has applied).
- Non-scholarship DBT schemes (the engine generalises, the copy does not).
- Accounts, saved profiles, notifications, payments.

## 6. Positioning: why not just redesign the portal

A prettier status page cannot help, because the portal **does not hold the failing fact**. The value here
is cross-system reasoning under uncertainty plus a concrete artifact — a redesign of one system cannot
produce either. Put this sentence on the About page in the product's own voice.

## 7. Success metrics for the demo

| Metric | Target |
|--------|--------|
| Cold start → resolved demo case | ≤ 4 minutes, ≤ 12 taps |
| Questions asked before a usable diagnosis | ≤ 5 |
| Free-text intake correctly routed to a top-3 hypothesis | 3/3 demo cases, 8/10 test transcripts |
| Screens where provenance is unlabelled | 0 |
| Journey completion with `OPENAI_API_KEY` unset | 3/3 demo cases |

## 8. Product principles

1. **Name the unknown.** An honest "we can't tell which of these two it is, here's the one check that
   separates them" beats a confident guess. This is the product.
2. **Every screen ends in an action.** No screen is only an explanation.
3. **One question at a time.** Never a form of fourteen fields.
4. **The student owns the sending.** We draft; they send. Always.
5. **Plain Indian English, short sentences.** No "leverage", no "kindly do the needful", no jargon
   without a one-line gloss the first time it appears.
