// SYNTHETIC RECORDS. Every row here is fictional. No live system is contacted.
import type { GovAccount, GovApplication, GovMapping, GovPayment } from '../types';

export type SeedBundle = {
  caseNo: 1 | 2 | 3;
  application: GovApplication;
  payment: GovPayment;
  mapping: GovMapping;
  account: GovAccount;
  /** The student's own words, injected as intake for the demo case. */
  intakeText: string;
  statusText: string;
};

export const SEEDS: SeedBundle[] = [
  {
    caseNo: 1,
    application: {
      applicationId: 'NSP-DEMO-1001',
      studentAlias: 'Priya K. (demo)',
      nameOnApplication: 'PRIYA K',
      scheme: 'Post-Matric Scholarship (demo scheme)',
      academicYear: '2025-26',
      amountPaise: 2300000,
      instituteVerifiedAt: '2025-11-18',
      stateVerifiedAt: '2025-12-02',
      sanctionedAt: '2025-12-20',
      portalStatusText: 'Application Status: SANCTIONED — Payment under process',
      bankRefId: 'BANK-DEMO-A',
      aliasKey: 'ALIAS-DEMO-A',
    },
    payment: {
      paymentId: 'PAY-DEMO-1001',
      applicationId: 'NSP-DEMO-1001',
      status: 'RETURNED',
      processedAt: '2026-01-08',
      returnReason: 'ACCOUNT_NOT_DBT_ENABLED',
      utr: 'UTRDEMO0001',
      pendingUntilDay: null,
    },
    mapping: {
      mappingId: 'MAP-DEMO-A',
      aliasKey: 'ALIAS-DEMO-A',
      mappedBank: 'Demo Bank of India',
      dbtEnabled: false,
      lastUpdated: '2024-07-02',
    },
    account: {
      bankRefId: 'BANK-DEMO-A',
      bankName: 'Demo Bank of India',
      accountMasked: 'XXXXXX4417',
      accountStatus: 'ACTIVE',
      nameOnAccount: 'PRIYA K',
      aadhaarSeeded: true,
      dbtEnabled: false,
    },
    intakeText:
      'portal pe December se sanctioned dikha raha hai, 23000 ka post matric. college wale bol rahe hain unka kaam ho gaya. account me kuch nahi aaya abhi tak. mere do dost ko mil gaya. bank gaya tha to bola aadhaar link hai.',
    statusText: 'Application Status: SANCTIONED — Payment under process',
  },
  {
    caseNo: 2,
    application: {
      applicationId: 'NSP-DEMO-1002',
      studentAlias: 'Arjun M. (demo)',
      nameOnApplication: 'ARJUN M',
      scheme: 'Post-Matric Scholarship (demo scheme)',
      academicYear: '2025-26',
      amountPaise: 1800000,
      instituteVerifiedAt: '2025-10-30',
      stateVerifiedAt: '2025-11-25',
      sanctionedAt: '2025-12-05',
      portalStatusText: 'Application Status: SANCTIONED',
      bankRefId: 'BANK-DEMO-B',
      aliasKey: 'ALIAS-DEMO-B',
    },
    payment: {
      paymentId: null,
      applicationId: 'NSP-DEMO-1002',
      status: 'NO_RECORD',
      processedAt: null,
      returnReason: null,
      utr: null,
      pendingUntilDay: null,
    },
    mapping: {
      mappingId: 'MAP-DEMO-B',
      aliasKey: 'ALIAS-DEMO-B',
      mappedBank: 'Demo Grameen Bank',
      dbtEnabled: true,
      lastUpdated: '2025-08-11',
    },
    account: {
      bankRefId: 'BANK-DEMO-B',
      bankName: 'Demo Grameen Bank',
      accountMasked: 'XXXXXX9021',
      accountStatus: 'ACTIVE',
      nameOnAccount: 'ARJUN M',
      aadhaarSeeded: true,
      dbtEnabled: true,
    },
    intakeText:
      'My post-matric scholarship shows sanctioned since 5 December but no money. My account is fine, I get other payments in it. Nobody in my class has received this year scholarship. College says it is not in their hands now.',
    statusText: 'Application Status: SANCTIONED',
  },
  {
    caseNo: 3,
    application: {
      applicationId: 'NSP-DEMO-1003',
      studentAlias: 'Sana R. (demo)',
      nameOnApplication: 'SANA R.',
      scheme: 'Post-Matric Scholarship (demo scheme)',
      academicYear: '2025-26',
      amountPaise: 2600000,
      instituteVerifiedAt: '2025-11-05',
      stateVerifiedAt: '2025-11-28',
      sanctionedAt: '2025-12-12',
      portalStatusText: 'Application Status: SANCTIONED — Amount released',
      bankRefId: 'BANK-DEMO-C',
      aliasKey: 'ALIAS-DEMO-C',
    },
    payment: {
      paymentId: 'PAY-DEMO-1003',
      applicationId: 'NSP-DEMO-1003',
      status: 'RETURNED',
      processedAt: '2026-01-02',
      returnReason: 'ACCOUNT_INACTIVE',
      utr: 'UTRDEMO0003',
      pendingUntilDay: null,
    },
    mapping: {
      mappingId: 'MAP-DEMO-C',
      aliasKey: 'ALIAS-DEMO-C',
      mappedBank: 'Demo Co-operative Bank',
      dbtEnabled: true,
      lastUpdated: '2023-02-19',
    },
    account: {
      bankRefId: 'BANK-DEMO-C',
      bankName: 'Demo Co-operative Bank',
      accountMasked: 'XXXXXX7734',
      accountStatus: 'DORMANT',
      nameOnAccount: 'SANA RAHMAN',
      aadhaarSeeded: true,
      dbtEnabled: true,
    },
    intakeText:
      'Scholarship approved in December, 26000. I gave my old account from school days, I have not used it in maybe two years. Also my name is short form on the college records. Money not received.',
    statusText: 'Application Status: SANCTIONED — Amount released',
  },
];

export function seedFor(caseNo: number): SeedBundle {
  const s = SEEDS.find((x) => x.caseNo === caseNo);
  if (!s) throw new Error(`No demo seed for case ${caseNo}`);
  return structuredClone(s);
}

export const DEMO_CASE_SUMMARIES = [
  {
    caseNo: 1 as const,
    student: 'Priya K. (demo)',
    symptom: 'Status says sanctioned since December, nothing in the account.',
    expected: 'Resolves: the account is Aadhaar-linked but not switched on for benefit payments.',
    judgeGuide: 'Run → Continue → answer 2 questions → See what to do → Generate letter → Mark as done → Verify → Check again. Watch for the seeded-versus-enabled distinction and the single blocked stage on the rail.',
    minutes: '~90 seconds',
  },
  {
    caseNo: 2 as const,
    student: 'Arjun M. (demo)',
    symptom: 'Sanctioned in December, nobody in the class has been paid.',
    expected: 'Ends in an honest escalation, not a fake resolution.',
    judgeGuide: 'Run → Continue → answer 1 question → See what to do → Generate follow-up → Mark as done → Verify → Escalate twice. Watch that it never claims to know which office holds the file.',
    minutes: '~2 minutes',
  },
  {
    caseNo: 3 as const,
    student: 'Sana R. (demo)',
    symptom: 'Old unused account, and the name is a short form on college records.',
    expected: 'Two live possibilities, and one bank visit designed to settle both.',
    judgeGuide: 'Run → Continue → answer 3 questions → See what to do → Generate letter → Mark as done → Verify → Check again. Watch the runner-up hypothesis stay visible instead of being guessed away.',
    minutes: '~2 minutes',
  },
];
