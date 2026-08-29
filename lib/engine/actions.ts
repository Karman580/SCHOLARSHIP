import type { ActionInput, Outcome } from '../types';
import type { FactMap } from './facts';
import { factValue } from './facts';
import { getHypothesis } from './hypotheses';
import { rankCandidates } from './questions';

const OUT = (id: string, label: string, mockAction: Outcome['mockAction']): Outcome => ({ id, label, mockAction });

const NOTHING = OUT('NOT_DONE_YET', "Couldn't go yet", 'NOTHING_HAPPENED');
const REFUSED = OUT('REFUSED', 'Counter refused or could not help', 'NOTHING_HAPPENED');

const PLANS: Record<string, ActionInput[]> = {
  PLAN_DBT: [
    {
      actionKey: 'DBT_CONFIRM_AT_BRANCH',
      seq: 1,
      title: 'Confirm what your bank has on record',
      artifactType: 'BANK_DBT_REQUEST',
      body: {
        doThis:
          'Go to your branch and ask whether this account is seeded with your Aadhaar AND enabled for Aadhaar-based benefit transfers. Ask for both answers separately.',
        where: 'Your bank branch counter',
        takeWith: ['Passbook', 'Photo ID', 'A printout of your application', 'The letter below'],
        expect: 'They check and tell you: enabled, not enabled, or linked but not enabled.',
        typicalTime: 'One visit',
        note: 'Linked and enabled are two different switches. Most people are told only about the first one.',
        outcomes: [
          OUT('SEEDED_NOW', 'Bank filled the form and enabled it', 'BANK_SEEDED_DBT'),
          OUT('ALREADY_ENABLED', 'Bank said it is already enabled', 'NOTHING_HAPPENED'),
          REFUSED,
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'DBT_GIVE_LETTER',
      seq: 2,
      title: 'Give the bank the written request and get it acknowledged',
      artifactType: 'BANK_DBT_REQUEST',
      body: {
        doThis:
          'Hand over the written request and ask for an acknowledgement with a date and a stamp. A dated acknowledgement is what makes the next step possible if nothing moves.',
        where: 'Same branch counter',
        takeWith: ['Two printed copies of the letter', 'Passbook'],
        expect: 'One copy back, stamped and dated.',
        typicalTime: 'Same visit',
        outcomes: [
          OUT('ACK_RECEIVED', 'Got a dated acknowledgement', 'BANK_SEEDED_DBT'),
          REFUSED,
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'DBT_TELL_COLLEGE',
      seq: 3,
      title: 'Tell your college nodal officer the account is now enabled',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Inform the nodal officer in writing so the payment can be sent again.',
        where: 'College scholarship or nodal office',
        takeWith: ['The bank acknowledgement', 'The follow-up letter below'],
        expect: 'They note it and ask the department to re-attempt the payment.',
        typicalTime: '10 minutes',
        outcomes: [OUT('INFORMED', 'Informed the college', 'PAYMENT_REPUSHED'), NOTHING],
      },
    },
    {
      actionKey: 'DBT_CHECK_AGAIN',
      seq: 4,
      title: 'Check again after about 7 working days',
      body: {
        doThis: 'Update your passbook and come back here to record what happened.',
        where: 'Your bank app or passbook',
        takeWith: [],
        expect: 'Either the credit appears, or we move to the next step together.',
        typicalTime: '5 minutes',
        outcomes: [
          OUT('CREDIT_SEEN', 'The money arrived', 'NOTHING_HAPPENED'),
          OUT('STILL_NOTHING', 'Still nothing', 'NOTHING_HAPPENED'),
        ],
      },
    },
  ],

  PLAN_NOT_INITIATED: [
    {
      actionKey: 'NI_ASK_NODAL',
      seq: 1,
      title: 'Ask the college nodal officer for the sanction and onward reference',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis:
          'Ask three things: the date your application was verified, the sanction reference, and the date it was sent onward for payment.',
        where: 'College scholarship or nodal office',
        takeWith: ['Application printout', 'Student ID', 'The letter below'],
        expect: 'Either they give you the references, or they tell you it is no longer with them.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('GOT_REFERENCE', 'They gave a payment reference', 'PAYMENT_REPUSHED'),
          OUT('NO_REFERENCE', 'They replied but could not give a payment reference', 'NOTHING_HAPPENED'),
          OUT('COMPLETED_VERIFICATION', 'They completed a pending verification', 'INSTITUTE_VERIFIED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'NI_WRITTEN_FOLLOWUP',
      seq: 2,
      title: 'Leave the written follow-up and get it acknowledged',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Give the letter, keep a stamped copy. Wait 7 days for a reply.',
        where: 'College scholarship or nodal office',
        takeWith: ['Two printed copies'],
        expect: 'A dated acknowledgement.',
        typicalTime: '10 minutes',
        outcomes: [
          OUT('REPLIED', 'They replied usefully', 'PAYMENT_REPUSHED'),
          OUT('NO_REPLY', 'No useful reply in 7 days', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'NI_GRIEVANCE',
      seq: 3,
      title: 'File the portal grievance with the reference numbers',
      artifactType: 'PORTAL_GRIEVANCE',
      body: {
        doThis: 'Raise a grievance quoting your application number and the dates so far. Keep the ticket number.',
        where: 'The scheme portal grievance section',
        takeWith: ['Application number', 'Dates of everything you have already done'],
        expect: 'A ticket number.',
        typicalTime: '15 minutes',
        outcomes: [
          OUT('TICKET_RAISED', 'Ticket raised', 'NOTHING_HAPPENED'),
          OUT('NO_REPLY', 'No useful reply', 'NOTHING_HAPPENED'),
        ],
      },
    },
  ],

  PLAN_ACCOUNT_UNUSABLE: [
    {
      actionKey: 'AU_CHECK_STATUS',
      seq: 1,
      title: 'Check the account status at the branch',
      artifactType: 'BANK_REACTIVATION_REQUEST',
      body: {
        doThis:
          'Ask whether the account is active, dormant, closed or limited. While you are there, ask the counter to read out the name held on the account and compare it word for word with your application.',
        where: 'Your bank branch counter',
        takeWith: ['Passbook', 'Photo ID', 'Application printout', 'The letter below'],
        expect: 'A clear status word, and the exact name on the account.',
        typicalTime: 'One visit',
        note: 'This one visit answers both possibilities: whether the account could take the credit, and whether the name matched.',
        outcomes: [
          OUT('REACTIVATED', 'Account reactivated, name is the same', 'ACCOUNT_REACTIVATED'),
          OUT('REACTIVATED_NAME_DIFF', 'Account reactivated, and the name is different', 'NAME_CORRECTED'),
          OUT('CLOSED_NEW_ACCOUNT', 'It was closed, I gave a new enabled account', 'NEW_ACCOUNT_PROVIDED'),
          REFUSED,
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'AU_REACTIVATE',
      seq: 2,
      title: 'Reactivate the account or complete KYC',
      artifactType: 'BANK_REACTIVATION_REQUEST',
      body: {
        doThis:
          'Give the written request to reactivate. If the account is closed, open or nominate another account and get it enabled for benefit transfers, then update it with your college.',
        where: 'Your bank branch counter',
        takeWith: ['KYC documents', 'Passbook', 'Two printed copies of the letter'],
        expect: 'A dated acknowledgement, and a date by which it will be active.',
        typicalTime: 'One visit, sometimes a few days to take effect',
        outcomes: [
          OUT('REACTIVATED', 'Account reactivated', 'ACCOUNT_REACTIVATED'),
          OUT('NEW_ACCOUNT', 'Gave a new account and had it enabled', 'NEW_ACCOUNT_PROVIDED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'AU_TELL_COLLEGE',
      seq: 3,
      title: 'Inform the college so the payment is attempted again',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Tell the nodal officer in writing that the account can now receive the credit.',
        where: 'College scholarship or nodal office',
        takeWith: ['The bank acknowledgement'],
        expect: 'They ask the department to re-attempt the payment.',
        typicalTime: '10 minutes',
        outcomes: [OUT('INFORMED', 'Informed the college', 'PAYMENT_REPUSHED'), NOTHING],
      },
    },
  ],

  PLAN_NAME_MISMATCH: [
    {
      actionKey: 'NM_COMPARE',
      seq: 1,
      title: 'Compare the name on the account with the name on the application',
      artifactType: 'BANK_DBT_REQUEST',
      body: {
        doThis: 'Ask the counter to read out the name exactly as held. Compare initials, expansions and spellings.',
        where: 'Your bank branch counter',
        takeWith: ['Passbook', 'Photo ID', 'Application printout'],
        expect: 'You learn whether the two records actually differ.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('NAME_DIFFERENT', 'The names are different', 'NAME_CORRECTED'),
          OUT('NAME_SAME', 'The names match', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'NM_CORRECT',
      seq: 2,
      title: 'Get one of the two records corrected',
      artifactType: 'BANK_DBT_REQUEST',
      body: {
        doThis: 'Ask the bank to correct the name, or ask the college to correct the application record. Whichever is wrong.',
        where: 'Bank branch or college office',
        takeWith: ['Proof of name', 'Two printed copies of the letter'],
        expect: 'A dated acknowledgement of the correction request.',
        typicalTime: 'One visit',
        outcomes: [OUT('CORRECTED', 'The record was corrected', 'NAME_CORRECTED'), NOTHING],
      },
    },
  ],

  PLAN_MAPPED_ELSEWHERE: [
    {
      actionKey: 'ME_FIND_MAPPING',
      seq: 1,
      title: 'Find out which bank currently holds your Aadhaar link',
      body: {
        doThis:
          'Ask at any branch which bank your Aadhaar is currently mapped to for benefit payments. The answer may not be the bank you expect.',
        where: 'Any branch of a bank where you hold an account',
        takeWith: ['Passbook', 'Photo ID'],
        expect: 'The name of the bank that currently holds the link.',
        typicalTime: 'One visit',
        note: 'The link follows the last account you seeded, not the account you wrote on the form.',
        outcomes: [
          OUT('OTHER_BANK', 'It points at a different bank', 'NOTHING_HAPPENED'),
          OUT('THIS_BANK', 'It points at this account', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'ME_CHECK_OR_MOVE',
      seq: 2,
      title: 'Check that account, or move the link',
      artifactType: 'BANK_DBT_REQUEST',
      body: {
        doThis:
          'Get a statement of the older account for the period since the sanction. If nothing is there, ask the bank you want paid into to move the link to that account.',
        where: 'The bank holding the link, and the bank you want paid into',
        takeWith: ['Passbook of both accounts if you have them', 'The letter below'],
        expect: 'Either you find the credit, or the link is moved.',
        typicalTime: 'One or two visits',
        outcomes: [
          OUT('FOUND_CREDIT', 'The money was in the other account', 'NOTHING_HAPPENED'),
          OUT('LINK_MOVED', 'The link was moved to the right account', 'BANK_SEEDED_DBT'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'ME_TELL_COLLEGE',
      seq: 3,
      title: 'Inform the college',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Tell the nodal officer which account should now receive the payment.',
        where: 'College scholarship or nodal office',
        takeWith: ['Bank acknowledgement'],
        expect: 'They ask for the payment to be re-attempted.',
        typicalTime: '10 minutes',
        outcomes: [OUT('INFORMED', 'Informed the college', 'PAYMENT_REPUSHED'), NOTHING],
      },
    },
  ],

  PLAN_ALREADY_PAID: [
    {
      actionKey: 'AP_CHECK_OTHER',
      seq: 1,
      title: 'Check the other account for the period since the sanction',
      body: {
        doThis:
          'Get a full statement of every account you hold, covering the sanction date onwards. Benefit credits often carry a scheme code rather than the scheme name.',
        where: 'Your bank app, passbook machine, or the branch',
        takeWith: ['Passbook', 'Photo ID'],
        expect: 'Either you find the credit, or you can rule this out for good.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('FOUND', 'Found the credit', 'NOTHING_HAPPENED'),
          OUT('NOT_FOUND', 'Nothing there', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'AP_RETURN',
      seq: 2,
      title: 'If nothing is there, come back and answer the account question',
      body: {
        doThis: 'Return here and tell us what the bank said about the account being enabled for benefit payments.',
        where: 'Here',
        takeWith: [],
        expect: 'We re-open the diagnosis with the new fact.',
        typicalTime: '2 minutes',
        outcomes: [OUT('RETURNED_WITH_INFO', 'I have the answer now', 'NOTHING_HAPPENED')],
      },
    },
  ],

  PLAN_INSTITUTE: [
    {
      actionKey: 'IN_ASK',
      seq: 1,
      title: 'Ask the college nodal officer to verify your application',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Ask what is pending from your side and what date they will verify by. Ask in writing.',
        where: 'College scholarship or nodal office',
        takeWith: ['Application printout', 'Student ID', 'The letter below'],
        expect: 'Either they verify, or they tell you what is missing.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('VERIFIED', 'They completed the verification', 'INSTITUTE_VERIFIED'),
          OUT('PENDING_FROM_ME', 'Something is pending from my side', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'IN_ESCALATE',
      seq: 2,
      title: 'If there is no movement in 7 days, raise it a level',
      artifactType: 'PORTAL_GRIEVANCE',
      body: {
        doThis: 'Raise a grievance quoting the dates and what you were told.',
        where: 'The scheme portal grievance section',
        takeWith: ['Application number', 'Dates'],
        expect: 'A ticket number.',
        typicalTime: '15 minutes',
        outcomes: [OUT('TICKET_RAISED', 'Ticket raised', 'NOTHING_HAPPENED'), NOTHING],
      },
    },
  ],

  PLAN_STATE: [
    {
      actionKey: 'ST_ASK',
      seq: 1,
      title: 'Ask for the date it cleared the college and where it is now',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Ask the college for the onward date and reference, then follow it up at the state level.',
        where: 'College office, then the state nodal contact listed on the portal',
        takeWith: ['Application printout', 'The letter below'],
        expect: 'A date and a reference you can quote.',
        typicalTime: 'One visit plus a call',
        outcomes: [
          OUT('GOT_REFERENCE', 'Got a date and reference', 'NOTHING_HAPPENED'),
          OUT('NO_REFERENCE', 'No useful answer', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'ST_GRIEVANCE',
      seq: 2,
      title: 'File a grievance quoting the dates',
      artifactType: 'PORTAL_GRIEVANCE',
      body: {
        doThis: 'Raise a grievance with your application number and the dates you have collected.',
        where: 'The scheme portal grievance section',
        takeWith: ['Application number', 'Dates'],
        expect: 'A ticket number.',
        typicalTime: '15 minutes',
        outcomes: [OUT('TICKET_RAISED', 'Ticket raised', 'NOTHING_HAPPENED'), NOTHING],
      },
    },
  ],

  PLAN_SANCTION: [
    {
      actionKey: 'SA_ASK',
      seq: 1,
      title: 'Ask whether a sanction order actually exists for your application',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis:
          'Ask the college for the sanction number and date. A portal word like "approved" is not the same as a sanction order.',
        where: 'College scholarship or nodal office',
        takeWith: ['Application printout', 'The letter below'],
        expect: 'Either a sanction number and date, or confirmation that none was issued.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('SANCTION_EXISTS', 'A sanction exists', 'NOTHING_HAPPENED'),
          OUT('NO_SANCTION', 'No sanction has been issued', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'SA_GRIEVANCE',
      seq: 2,
      title: 'Raise it in writing if nothing comes back',
      artifactType: 'PORTAL_GRIEVANCE',
      body: {
        doThis: 'File a grievance asking specifically whether a sanction was issued and on what date.',
        where: 'The scheme portal grievance section',
        takeWith: ['Application number'],
        expect: 'A ticket number.',
        typicalTime: '15 minutes',
        outcomes: [OUT('TICKET_RAISED', 'Ticket raised', 'NOTHING_HAPPENED'), NOTHING],
      },
    },
  ],

  PLAN_DEFECTIVE: [
    {
      actionKey: 'DE_FIND_DEFECT',
      seq: 1,
      title: 'Find out exactly what was marked defective',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Ask the college for the exact defect recorded and the date it was recorded.',
        where: 'College scholarship or nodal office',
        takeWith: ['Application printout', 'All documents you uploaded', 'The letter below'],
        expect: 'A specific reason you can fix.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('FIXED', 'Fixed and resubmitted', 'INSTITUTE_VERIFIED'),
          OUT('NOT_TOLD', 'They could not tell me the reason', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
  ],

  PLAN_STUCK_AT_AGENCY: [
    {
      actionKey: 'SQ_ASK_REFERENCE',
      seq: 1,
      title: 'Get the payment reference and the date it was raised',
      artifactType: 'INSTITUTE_FOLLOWUP',
      body: {
        doThis: 'Ask the college or department for the payment reference and when it was raised.',
        where: 'College scholarship or nodal office',
        takeWith: ['Application printout', 'The letter below'],
        expect: 'A reference and a date you can quote in a grievance.',
        typicalTime: 'One visit',
        outcomes: [
          OUT('GOT_REFERENCE', 'Got the reference', 'PAYMENT_REPUSHED'),
          OUT('NO_REFERENCE', 'No useful answer', 'NOTHING_HAPPENED'),
          NOTHING,
        ],
      },
    },
    {
      actionKey: 'SQ_GRIEVANCE',
      seq: 2,
      title: 'Raise a grievance quoting the payment reference',
      artifactType: 'PORTAL_GRIEVANCE',
      body: {
        doThis: 'File a grievance asking for the payment to be processed, quoting the reference and date.',
        where: 'The scheme portal grievance section',
        takeWith: ['Payment reference', 'Application number'],
        expect: 'A ticket number.',
        typicalTime: '15 minutes',
        outcomes: [OUT('TICKET_RAISED', 'Ticket raised', 'NOTHING_HAPPENED'), NOTHING],
      },
    },
  ],
};

/**
 * The fee-deadline step is a first-class action, not an afterthought: a student under
 * deadline pressure needs the interim relief conversation to start today.
 */
function deadlineStep(seq: number): ActionInput {
  return {
    actionKey: 'FEE_DEADLINE_INTERIM',
    seq,
    title: 'Ask the college about the fee deadline while this is being chased',
    artifactType: 'INSTITUTE_FOLLOWUP',
    body: {
      doThis:
        'Tell the office that the scholarship payment is stuck and ask what happens to your fee deadline in the meantime. Ask what they normally do for students in this position.',
      where: 'College accounts or scholarship office',
      takeWith: ['Application printout', 'Anything showing the sanction'],
      expect: 'A clear answer on the deadline, in writing if possible.',
      typicalTime: 'One visit',
      outcomes: [
        OUT('EXTENSION_GIVEN', 'They agreed to wait', 'NOTHING_HAPPENED'),
        OUT('NO_EXTENSION', 'No change to the deadline', 'NOTHING_HAPPENED'),
        NOTHING,
      ],
    },
  };
}

/** Band LOW: a single information-gathering step, never a fix. */
export function insufficientInfoPlan(facts: FactMap, askedIds: string[]): ActionInput[] {
  const best = rankCandidates(facts, askedIds)[0];
  const steps = best?.question.howToCheck?.steps ?? [
    'Update your passbook and look at every entry since the sanction date.',
    'Note the exact status word the portal shows today.',
  ];
  return [
    {
      actionKey: 'LOW_ONE_CHECK',
      seq: 1,
      title: best ? `Find out: ${best.question.prompt.replace(/\?$/, '')}` : 'Collect the one fact that would separate these',
      artifactType: null,
      body: {
        doThis: steps.join(' Then: '),
        where: best?.question.cost === 2 ? 'Your bank branch or the college office' : 'Your bank app, passbook, or the portal',
        takeWith: ['Passbook', 'Photo ID', 'Application printout'],
        expect: 'One clear answer, which is enough for us to separate the two possibilities.',
        typicalTime: 'One visit or one lookup',
        note: 'We are not guessing on your behalf. This single check is what decides it.',
        outcomes: [OUT('CAME_BACK', 'I have the answer — take me back to the questions', 'NOTHING_HAPPENED')],
      },
    },
  ];
}

export function planFor(hypothesisId: string, facts: FactMap): ActionInput[] {
  const plan = PLANS[getHypothesis(hypothesisId).actionKey];
  if (!plan) throw new Error(`No action plan for ${hypothesisId}`);
  const steps = plan.map((s) => ({ ...s }));
  if (factValue(facts, 'fee_deadline_pressure') === 'YES') {
    return [deadlineStep(1), ...steps.map((s, i) => ({ ...s, seq: i + 2 }))];
  }
  return steps;
}

export function outcomeById(action: ActionInput, outcomeId: string): Outcome | null {
  return action.body.outcomes.find((o) => o.id === outcomeId) ?? null;
}

export const ALL_PLAN_KEYS = Object.keys(PLANS);
