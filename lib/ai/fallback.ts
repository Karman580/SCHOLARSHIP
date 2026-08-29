/**
 * Deterministic equivalents of every model call. With OPENAI_API_KEY unset the whole
 * journey still completes on these — that is a hard requirement, not a degraded mode.
 */
import type { ArtifactType, Band, FactInput, JourneyStage, Language, RankedHypothesis, UnknownItem } from '../types';
import type { FactKey } from '../engine/facts';
import { CLOSING_LINE, ARTIFACT_META } from '../engine/artifacts';
import type { QuestionDef } from '../engine/questions';
import type { ExtractionResult } from './schemas';

/* ---------------------------------------------------------------- extraction */

type Rule = { match: RegExp; facts: Partial<Record<FactKey, string>>; quote?: boolean };

const RULES: Rule[] = [
  // Scheme
  { match: /\bpost[\s-]?matric\b/i, facts: { scheme_type: 'POST_MATRIC' } },
  { match: /\bpre[\s-]?matric\b/i, facts: { scheme_type: 'PRE_MATRIC' } },
  { match: /\bmerit[\s-]?cum[\s-]?means\b/i, facts: { scheme_type: 'MERIT_CUM_MEANS' } },
  { match: /\btop[\s-]?class\b/i, facts: { scheme_type: 'TOP_CLASS' } },

  // Portal status. The first rule to match a key wins, so every negative reading is
  // listed before the affirmative one it would otherwise be swallowed by: a portal
  // saying "rejected" is decisive even in a sentence that also contains "approved".
  { match: /\b(defective|incomplete|दोषपूर्ण)\b/i, facts: { portal_status_code: 'DEFECTIVE', sanction_seen: 'NO' } },
  { match: /\b(rejected|अस्वीकृत)\b/i, facts: { portal_status_code: 'REJECTED', sanction_seen: 'NO' } },
  { match: /\b(not (yet )?(sanctioned|approved)|nahi hua sanction)\b/i, facts: { sanction_seen: 'NO' } },
  { match: /\b(sanction(ed|)|approved|स्वीकृत|manzoor)\b/i, facts: { portal_status_code: 'SANCTIONED', sanction_seen: 'YES' } },
  { match: /\b(under process|in process|processing|प्रक्रियाधीन|prakriya)\b/i, facts: { portal_status_code: 'STATE_PENDING' } },
  { match: /\b(amount released|paid|भुगतान हो गया)\b/i, facts: { portal_status_code: 'SANCTIONED', sanction_seen: 'YES' } },

  // Credit
  { match: /\b(nahi aaya|nahin aaya|kuch nahi|not received|no money|nothing (has )?(come|arrived)|paisa nahi|नहीं आया|अभी तक नहीं)\b/i, facts: { credit_seen: 'NO' } },
  { match: /\b(money (came|arrived|credited)|paisa aa gaya|आ गया)\b/i, facts: { credit_seen: 'YES' } },

  // Peers
  { match: /\b(dost|friend|classmate|batchmate)s?\b[^.]{0,40}\b(ko )?(mil gaya|got|received|paid)\b/i, facts: { peers_paid: 'YES' } },
  { match: /\b(nobody|no one|kisi ko nahi|koi nahi|किसी को नहीं)\b/i, facts: { peers_paid: 'NO' } },

  // College
  { match: /\bcollege\b[^.]{0,60}\b(not done|nahi kiya|nahi hua|pending|(has |have )?not (yet )?(verified|forwarded|done))\b/i, facts: { institute_verified: 'NO' } },
  { match: /\bcollege\b[^.]{0,60}\b(kaam ho gaya|ho gaya|done|verified|confirmed|approved it|forwarded)\b/i, facts: { institute_verified: 'YES' } },
  { match: /\b(college|clg)\b[^.]{0,60}\b(not in their hands|nothing (more )?(they|we) can|out of (their|our) hands)\b/i, facts: { institute_verified: 'YES' } },

  // Aadhaar link (deliberately NOT dbt_enabled_reported — being linked is not being enabled).
  // Negatives first: "not linked" contains "linked" and "not enabled" contains "enabled",
  // so the affirmative rule read first would invert the exact distinction this turns on.
  { match: /\b(aadhaar|aadhar|आधार)\b[^.]{0,30}\b(not link(ed)?|nahi link|unlinked|de-?linked)\b/i, facts: { aadhaar_linked_to_account: 'NO' } },
  { match: /\b(aadhaar|aadhar|आधार)\b[^.]{0,30}\b(link(ed)?|seeded|juda)\b/i, facts: { aadhaar_linked_to_account: 'YES' } },
  { match: /\b(dbt|benefit transfer)\b[^.]{0,40}\b(not enabled|not active|nahi enable|disabled|off)\b/i, facts: { dbt_enabled_reported: 'NO' } },
  { match: /\b(dbt|benefit transfer)\b[^.]{0,40}\b(enabled|active|on)\b/i, facts: { dbt_enabled_reported: 'YES' } },

  // Account state
  { match: /\b(not used|haven'?t used|nahi use kiya|unused|old account)\b[^.]{0,50}\b(years?|saal|months?)\b/i, facts: { account_status_reported: 'DORMANT' } },
  { match: /\b(dormant|inactive|frozen|band ho gaya)\b/i, facts: { account_status_reported: 'DORMANT' } },
  { match: /\baccount\b[^.]{0,30}\b(closed|band kar diya)\b/i, facts: { account_status_reported: 'CLOSED' } },
  { match: /\b(account is fine|account (is )?(active|working)|other payments? in it|use it regularly)\b/i, facts: { account_status_reported: 'ACTIVE' } },
  { match: /\b(new account|changed (my )?bank|naya account)\b/i, facts: { account_changed_since_application: 'YES', multiple_accounts: 'YES' } },

  // Payment system
  { match: /\b(pfms|payment (page|portal|tracking))\b[^.]{0,40}\b(no record|not found|koi record nahi)\b/i, facts: { payment_system_result: 'NO_RECORD' } },
  { match: /\b(returned|return ho gaya|bounced|wapas aa gaya|failed transaction)\b/i, facts: { payment_system_result: 'RETURNED' } },
  { match: /\b(not (yet )?processed|abhi process nahi)\b/i, facts: { payment_system_result: 'PENDING' } },
  { match: /\b(processed|payment (done|complete))\b/i, facts: { payment_system_result: 'PROCESSED' } },

  // Deadline
  { match: /\b(fee|फीस)\b[^.]{0,30}\b(deadline|due|last date|jama)\b/i, facts: { fee_deadline_pressure: 'YES' } },
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\\b`, 'i');

/** Buckets, not a precise count. A student saying "since December" is not giving us a date. */
export function daysSinceBucket(text: string, now = new Date()): string | null {
  const m = MONTH_RE.exec(text);
  if (!m) return null;
  const idx = MONTHS.findIndex((x) => x.startsWith(m[1]!.toLowerCase().slice(0, 3)));
  if (idx < 0) return null;
  const yearMatch = /\b(20\d{2})\b/.exec(text);
  let year = yearMatch ? Number(yearMatch[1]) : now.getUTCFullYear();
  const candidate = () => Date.UTC(year, idx, 15);
  if (!yearMatch && candidate() > now.getTime()) year -= 1;
  const days = Math.floor((now.getTime() - candidate()) / 86_400_000);
  if (days < 0) return null;
  if (days < 30) return '<30';
  if (days <= 60) return '30-60';
  return '>60';
}

export function fallbackExtract(input: {
  description: string;
  statusText: string;
  imageNames: string[];
  now?: Date;
}): { result: ExtractionResult; unreadableFiles: string[] } {
  const text = `${input.description}\n${input.statusText}`;
  const facts: ExtractionResult['facts'] = [];
  const seen = new Set<string>();

  const push = (key: FactKey, value: string, source: ExtractionResult['facts'][number]['source'], quote: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ key, value, source, confidence: 0.6, quote: quote.slice(0, 160) });
  };

  for (const rule of RULES) {
    const m = rule.match.exec(text);
    if (!m) continue;
    const inStatus = input.statusText ? rule.match.test(input.statusText) : false;
    for (const [k, v] of Object.entries(rule.facts)) {
      push(k as FactKey, v!, inStatus ? 'PASTED_STATUS' : 'STUDENT_TEXT', m[0]);
    }
  }

  const bucket = daysSinceBucket(text, input.now);
  if (bucket && !seen.has('days_since_sanction')) {
    push('days_since_sanction', bucket, 'STUDENT_TEXT', MONTH_RE.exec(text)?.[0] ?? '');
  }
  if (input.statusText.trim()) {
    push('portal_status_raw', input.statusText.trim().slice(0, 400), 'PASTED_STATUS', input.statusText.slice(0, 160));
  }

  return {
    result: {
      facts,
      restatement:
        'You have a scholarship that shows as approved, and the money has not reached your account yet.',
      uninterpreted: [],
      screenshotText: [],
    },
    // Offline rules mode cannot read images.
    unreadableFiles: input.imageNames,
  };
}

/* ---------------------------------------------------------------- explanation */

export const HYPOTHESIS_VERDICTS: Record<string, string> = {
  H_DBT_NOT_ENABLED:
    'Most likely the money was sent and came back, because your account is linked to Aadhaar but is not switched on to receive benefit payments.',
  H_PAYMENT_NOT_INITIATED:
    'Most likely the sanction exists but no payment instruction has gone out yet, so there is nothing wrong at your end or your bank.',
  H_INSTITUTE_PENDING:
    'Most likely your college has not completed their verification yet, so the file has not moved on.',
  H_ACCOUNT_UNUSABLE:
    'Most likely the payment reached your bank and bounced, because the account you gave cannot take a credit right now.',
  H_MAPPED_TO_OTHER_ACCOUNT:
    'Most likely your Aadhaar link points at a different account, so the money went somewhere other than the account you are watching.',
  H_STATE_PENDING:
    'Most likely the file has cleared your college and is waiting at the state or ministry level.',
  H_PAYMENT_STUCK_AT_AGENCY:
    'Most likely a payment record exists but has not been pushed through the payment system yet.',
  H_NAME_MISMATCH:
    'Most likely the payment bounced because the name on your application and the name on your bank account do not match.',
  H_ALREADY_PAID_UNSEEN:
    'Most likely the money has already been paid into an account you have not checked for this period.',
  H_SANCTION_NOT_ISSUED:
    'Most likely no sanction order has actually been issued yet, even though the portal wording sounds like approval.',
  H_APPLICATION_DEFECTIVE:
    'Most likely your application has been marked incomplete or defective, so it stops there until it is fixed.',
};

export function fallbackExplain(input: {
  band: Band;
  ranked: RankedHypothesis[];
  unknown: UnknownItem[];
}): { verdictText: string; why: string[]; unknownExplained: { id: string; text: string }[] } {
  const [top, second] = input.ranked;
  const verdictText =
    input.band === 'LOW'
      ? `We cannot narrow this down yet. It is either "${top?.label ?? 'one thing'}" or "${second?.label ?? 'another'}", and one check separates them.`
      : HYPOTHESIS_VERDICTS[top?.hypothesisId ?? ''] ?? 'We could not name a single most likely reason yet.';
  const why = (top?.why ?? []).slice(0, 4);
  return {
    verdictText,
    why: why.length >= 2 ? why : [...why, 'Nothing you have told us rules this out.'],
    unknownExplained: input.unknown.map((u) => ({ id: u.id, text: u.howToFindOut })),
  };
}

/* ---------------------------------------------------------------- drafting */

export type DraftContext = {
  type: ArtifactType;
  language: Language;
  scheme: string;
  academicYear: string;
  applicationRef: string;
  topHypothesisLabel: string;
  band: Band;
  known: string[];
  alreadyDone: string[];
  rungLabel: string;
  journey?: JourneyStage[];
  facts?: FactInput[];
  verdictText?: string;
};

const P = (s: string) => `[[${s}]]`;

const EN: Record<ArtifactType, (c: DraftContext) => { subject: string; body: string }> = {
  BANK_DBT_REQUEST: (c) => ({
    subject: 'Request to seed and enable my account for Aadhaar-based benefit transfers',
    body: [
      'To,',
      'The Branch Manager',
      `${P('branch name and address')}`,
      '',
      `Subject: Request to seed and enable my savings account for Aadhaar-based benefit transfers`,
      '',
      'Respected Sir / Madam,',
      '',
      `I hold a savings account at your branch. I am a student under the ${c.scheme} for the academic year ${c.academicYear}. My scholarship has been sanctioned, and the amount has not reached my account.`,
      '',
      'I request the following:',
      '1. Please confirm in writing whether my account is seeded with my Aadhaar and, separately, whether it is enabled for Aadhaar-based benefit transfers. These are two different things and I need both answers.',
      '2. If it is not enabled, please complete the enablement and tell me the date on which it takes effect.',
      '3. Please give me a dated acknowledgement of this request.',
      '',
      `What I have already done: ${c.alreadyDone.length ? c.alreadyDone.join('; ') : 'I have checked my passbook and followed up with my college.'}`,
      '',
      'Thank you for your help.',
      '',
      `Name: ${P('your name')}`,
      `Account number: ${P('your account number')}`,
      `Mobile: ${P('your mobile number')}`,
      `Date: ${P('date')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),

  BANK_REACTIVATION_REQUEST: (c) => ({
    subject: 'Request to reactivate my account and complete KYC',
    body: [
      'To,',
      'The Branch Manager',
      `${P('branch name and address')}`,
      '',
      'Subject: Request to reactivate my savings account and complete KYC',
      '',
      'Respected Sir / Madam,',
      '',
      `I hold a savings account at your branch which I believe has become inactive. A scholarship payment under the ${c.scheme} for ${c.academicYear} is expected into this account.`,
      '',
      'I request the following:',
      '1. Please tell me the current status of the account and what is needed to make it active again.',
      '2. Please complete the reactivation or KYC formalities so the account can receive a credit.',
      '3. Please read out and confirm the name held on the account, so I can check it against my application.',
      '4. Please give me a dated acknowledgement of this request.',
      '',
      `What I have already done: ${c.alreadyDone.length ? c.alreadyDone.join('; ') : 'I have checked my passbook and followed up with my college.'}`,
      '',
      'Thank you for your help.',
      '',
      `Name: ${P('your name')}`,
      `Account number: ${P('your account number')}`,
      `Date: ${P('date')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),

  INSTITUTE_FOLLOWUP: (c) => ({
    subject: 'Follow-up on my scholarship payment',
    body: [
      'To,',
      'The Nodal Officer, Scholarship Cell',
      `${P('college name')}`,
      '',
      `Subject: Follow-up on my ${c.scheme} payment for ${c.academicYear}`,
      '',
      'Respected Sir / Madam,',
      '',
      `My application reference is ${c.applicationRef}. The portal status I can see is: ${c.known[0] ?? 'sanctioned'}. The amount has not reached my bank account.`,
      '',
      'I request three specific things:',
      '1. The date on which my application was verified at the institute level.',
      '2. The reference under which it was sent onward for payment, and the date it was sent.',
      '3. The name and designation of the person I should contact next if this office cannot take it further.',
      '',
      `What I have already done: ${c.alreadyDone.length ? c.alreadyDone.join('; ') : 'I have checked my bank passbook and asked at my bank branch.'}`,
      '',
      'I would be grateful for a written reply so that I have a record of the dates.',
      '',
      `Name: ${P('your name')}`,
      `Enrolment number: ${P('your enrolment number')}`,
      `Date: ${P('date')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),

  PORTAL_GRIEVANCE: (c) => ({
    subject: 'Scholarship sanctioned but payment not received',
    body: [
      `Application reference: ${c.applicationRef}`,
      `Scheme: ${c.scheme}, ${c.academicYear}`,
      '',
      `My application shows as sanctioned and the amount has not reached my bank account. ${c.alreadyDone.length ? `I have already: ${c.alreadyDone.join('; ')}.` : 'I have already checked my passbook and followed up with my college.'}`,
      '',
      'My question is specific: has a payment instruction been issued against this application, on what date, and if it was returned, what reason was recorded?',
      '',
      `Please reply with the reference so I can follow it up. Contact: ${P('your mobile number')}.`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),

  RTI_DRAFT: (c) => ({
    subject: 'Request for information about my own scholarship application',
    body: [
      'To,',
      'The Public Information Officer',
      `${P('state nodal department name and address')}`,
      '',
      'Subject: Request for information regarding my own scholarship application',
      '',
      'Respected Sir / Madam,',
      '',
      `I am seeking information about my own application under the ${c.scheme} for the academic year ${c.academicYear}. My application reference is ${c.applicationRef}.`,
      '',
      'Please provide the following:',
      '1. The current stage of my application and the date on which it reached that stage.',
      '2. Whether a payment instruction was issued against my application, and if so, on what date.',
      '3. If any payment was returned or rejected, the reason recorded against it.',
      '4. The name and designation of the officer currently responsible for processing my application.',
      '',
      'I am willing to pay the prescribed fee. Please tell me the amount and how to pay it.',
      '',
      `Name: ${P('your name')}`,
      `Address: ${P('your postal address')}`,
      `Date: ${P('date')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),

  CASE_SUMMARY: (c) => ({
    subject: 'Case summary',
    body: [
      'Scholarship Saathi — case summary',
      '',
      `Scheme: ${c.scheme}`,
      `Academic year: ${c.academicYear}`,
      `Application reference: ${c.applicationRef}`,
      '',
      'What we think is happening',
      `${c.verdictText ?? c.topHypothesisLabel}`,
      `Confidence: ${c.band === 'HIGH' ? 'Fairly confident' : c.band === 'MEDIUM' ? 'Possible' : 'Not enough information yet'}`,
      '',
      'What is known',
      ...(c.known.length ? c.known.map((k) => `- ${k}`) : ['- Nothing recorded yet.']),
      '',
      'What has been done',
      ...(c.alreadyDone.length ? c.alreadyDone.map((k) => `- ${k}`) : ['- Nothing recorded yet.']),
      '',
      'Payment journey as we understand it',
      ...(c.journey ?? []).map((s) => `${s.stageId}. ${s.label} — ${s.status.toLowerCase().replace('_', ' ')} (${PROV_LABEL[s.provenance]})`),
      '',
      `Current escalation step: ${c.rungLabel}`,
      '',
      'Every government-shaped record in this summary is a synthetic demo record, not a real one.',
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),
};

const PROV_LABEL: Record<string, string> = {
  PUBLIC_RULE: 'Public rule',
  SIMULATED: 'Demo record',
  USER_STATED: 'You told us',
  AI_INFERENCE: 'Our estimate',
};

/** Real Hindi, shipped as data so Hindi works with no model and no network. */
const HI: Partial<Record<ArtifactType, (c: DraftContext) => { subject: string; body: string }>> = {
  BANK_DBT_REQUEST: (c) => ({
    subject: 'मेरे खाते को आधार आधारित लाभ अंतरण (Aadhaar-based benefit transfer) के लिए सक्षम करने का अनुरोध',
    body: [
      'सेवा में,',
      'शाखा प्रबंधक',
      `${P('शाखा का नाम और पता')}`,
      '',
      'विषय: मेरे बचत खाते को आधार से जोड़ने और लाभ अंतरण (benefit transfer) के लिए सक्षम करने का अनुरोध',
      '',
      'महोदय / महोदया,',
      '',
      `मेरा आपकी शाखा में बचत खाता है। मैं ${c.academicYear} के लिए ${c.scheme} का विद्यार्थी हूँ। मेरी छात्रवृत्ति (scholarship) स्वीकृत हो चुकी है, परंतु राशि मेरे खाते में नहीं पहुँची है।`,
      '',
      'मेरा अनुरोध है:',
      '1. कृपया लिखित में बताएं कि मेरा खाता आधार से जुड़ा (seeded) है या नहीं, और अलग से यह भी कि वह लाभ अंतरण (DBT) के लिए सक्षम है या नहीं। ये दो अलग बातें हैं और मुझे दोनों उत्तर चाहिए।',
      '2. यदि सक्षम नहीं है, तो कृपया इसे सक्षम करें और वह तिथि बताएं जिससे यह प्रभावी होगा।',
      '3. कृपया इस अनुरोध की दिनांकित पावती दें।',
      '',
      'आपके सहयोग के लिए धन्यवाद।',
      '',
      `नाम: ${P('आपका नाम')}`,
      `खाता संख्या: ${P('आपकी खाता संख्या')}`,
      `दिनांक: ${P('दिनांक')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),
  BANK_REACTIVATION_REQUEST: (c) => ({
    subject: 'निष्क्रिय खाते को पुनः चालू करने का अनुरोध',
    body: [
      'सेवा में,',
      'शाखा प्रबंधक',
      `${P('शाखा का नाम और पता')}`,
      '',
      'विषय: मेरे बचत खाते को पुनः चालू (reactivate) करने और केवाईसी (KYC) पूरी करने का अनुरोध',
      '',
      'महोदय / महोदया,',
      '',
      `आपकी शाखा में मेरा बचत खाता है जो संभवतः निष्क्रिय हो गया है। ${c.academicYear} के ${c.scheme} की छात्रवृत्ति (scholarship) इसी खाते में आनी है।`,
      '',
      'मेरा अनुरोध है:',
      '1. कृपया खाते की वर्तमान स्थिति बताएं और यह भी कि इसे चालू करने के लिए क्या आवश्यक है।',
      '2. कृपया पुनः सक्रियण या केवाईसी की औपचारिकता पूरी करें।',
      '3. कृपया खाते पर दर्ज नाम पढ़कर बताएं, ताकि मैं उसे अपने आवेदन से मिला सकूँ।',
      '4. कृपया इस अनुरोध की दिनांकित पावती दें।',
      '',
      `नाम: ${P('आपका नाम')}`,
      `खाता संख्या: ${P('आपकी खाता संख्या')}`,
      `दिनांक: ${P('दिनांक')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),
  INSTITUTE_FOLLOWUP: (c) => ({
    subject: 'छात्रवृत्ति भुगतान के संबंध में अनुस्मारक',
    body: [
      'सेवा में,',
      'नोडल अधिकारी, छात्रवृत्ति प्रकोष्ठ',
      `${P('महाविद्यालय का नाम')}`,
      '',
      `विषय: ${c.academicYear} के ${c.scheme} भुगतान के संबंध में`,
      '',
      'महोदय / महोदया,',
      '',
      `मेरा आवेदन संदर्भ ${c.applicationRef} है। पोर्टल पर मुझे जो स्थिति दिख रही है वह है: ${c.known[0] ?? 'स्वीकृत'}। राशि मेरे बैंक खाते में नहीं पहुँची है।`,
      '',
      'मेरे तीन विशिष्ट अनुरोध हैं:',
      '1. वह तिथि जिस दिन मेरा आवेदन संस्थान स्तर पर सत्यापित (verify) हुआ।',
      '2. वह संदर्भ संख्या जिसके अंतर्गत इसे भुगतान के लिए आगे भेजा गया, और भेजे जाने की तिथि।',
      '3. यदि यह कार्यालय आगे कुछ नहीं कर सकता, तो अगले संपर्क अधिकारी का नाम और पदनाम।',
      '',
      'कृपया लिखित उत्तर दें ताकि मेरे पास तिथियों का अभिलेख रहे।',
      '',
      `नाम: ${P('आपका नाम')}`,
      `नामांकन संख्या: ${P('आपकी नामांकन संख्या')}`,
      `दिनांक: ${P('दिनांक')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),
  PORTAL_GRIEVANCE: (c) => ({
    subject: 'छात्रवृत्ति स्वीकृत, परंतु भुगतान प्राप्त नहीं',
    body: [
      `आवेदन संदर्भ: ${c.applicationRef}`,
      `योजना: ${c.scheme}, ${c.academicYear}`,
      '',
      'मेरा आवेदन स्वीकृत दिख रहा है और राशि मेरे बैंक खाते में नहीं पहुँची है।',
      '',
      'मेरा प्रश्न विशिष्ट है: क्या इस आवेदन के विरुद्ध भुगतान निर्देश (payment instruction) जारी हुआ, किस तिथि को, और यदि वह वापस आया तो उसका क्या कारण दर्ज है?',
      '',
      `कृपया संदर्भ संख्या के साथ उत्तर दें। संपर्क: ${P('आपका मोबाइल नंबर')}।`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),
  RTI_DRAFT: (c) => ({
    subject: 'मेरे अपने छात्रवृत्ति आवेदन के संबंध में सूचना का अनुरोध',
    body: [
      'सेवा में,',
      'जन सूचना अधिकारी',
      `${P('राज्य नोडल विभाग का नाम और पता')}`,
      '',
      'विषय: मेरे अपने छात्रवृत्ति (scholarship) आवेदन से संबंधित सूचना',
      '',
      'महोदय / महोदया,',
      '',
      `मैं ${c.academicYear} के ${c.scheme} के अंतर्गत अपने आवेदन (संदर्भ ${c.applicationRef}) के बारे में सूचना चाहता/चाहती हूँ।`,
      '',
      'कृपया निम्न सूचना दें:',
      '1. मेरे आवेदन की वर्तमान अवस्था और वह तिथि जब वह इस अवस्था में पहुँचा।',
      '2. क्या मेरे आवेदन के विरुद्ध भुगतान निर्देश जारी हुआ, और यदि हाँ तो किस तिथि को।',
      '3. यदि कोई भुगतान वापस या अस्वीकृत हुआ, तो उसके विरुद्ध दर्ज कारण।',
      '4. मेरे आवेदन के लिए वर्तमान में उत्तरदायी अधिकारी का नाम और पदनाम।',
      '',
      'मैं निर्धारित शुल्क देने को तैयार हूँ। कृपया राशि और भुगतान की विधि बताएं।',
      '',
      `नाम: ${P('आपका नाम')}`,
      `पता: ${P('आपका डाक पता')}`,
      `दिनांक: ${P('दिनांक')}`,
      '',
      CLOSING_LINE,
    ].join('\n'),
  }),
};

export function fallbackDraft(c: DraftContext): { recipient: string; subject: string; body: string } {
  const build = (c.language === 'hi' ? HI[c.type] : undefined) ?? EN[c.type];
  const { subject, body } = build(c);
  return { recipient: ARTIFACT_META[c.type].recipient, subject, body };
}

/** The engine already picked the question; offline we use its own wording verbatim. */
export function fallbackQuestion(q: QuestionDef): { prompt: string; why: string; optionLabels: Record<string, string> } {
  return {
    prompt: q.prompt,
    why: q.why,
    optionLabels: Object.fromEntries(q.options.map((o) => [o.id, o.label])),
  };
}
