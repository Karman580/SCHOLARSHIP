import type { ArtifactType } from '../types';
import { getHypothesis } from './hypotheses';

export type Rung = {
  id: string;
  label: string;
  canDo: string;
  artifactType: ArtifactType;
  waitDays: number;
  /** Publicly documented process note. Never a legal deadline we claim to have verified. */
  publicRuleNote: string;
};

export const SCHEME_LADDER: Rung[] = [
  {
    id: 'INSTITUTE',
    label: 'College nodal officer',
    canDo: 'Can confirm the verification date and give you the reference the file moved on with.',
    artifactType: 'INSTITUTE_FOLLOWUP',
    waitDays: 7,
    publicRuleNote: 'Institutes are the first point of contact in most scholarship schemes. Waiting periods vary by scheme and state — check the current rule for yours.',
  },
  {
    id: 'STATE_NODAL',
    label: 'State nodal officer',
    canDo: 'Can see the file at the state level and say whether it moved onward for payment.',
    artifactType: 'PORTAL_GRIEVANCE',
    waitDays: 15,
    publicRuleNote: 'State nodal officers are commonly listed on the scheme portal. Timelines vary by state.',
  },
  {
    id: 'PORTAL_HELPDESK',
    label: 'Portal helpdesk ticket',
    canDo: 'Can raise a ticket against your application number and give you a ticket reference.',
    artifactType: 'PORTAL_GRIEVANCE',
    waitDays: 15,
    publicRuleNote: 'Helpdesks usually issue a ticket number. Keep it — the next rung will ask for it.',
  },
  {
    id: 'MINISTRY',
    label: 'Scheme ministry grievance',
    canDo: 'Can direct the department handling the scheme to respond.',
    artifactType: 'PORTAL_GRIEVANCE',
    waitDays: 30,
    publicRuleNote: 'Ministry-level grievance routes are publicly published. The commonly published waiting period before escalating again is about a month.',
  },
  {
    id: 'PUBLIC_GRIEVANCE',
    label: 'Public grievance portal',
    canDo: 'Records a dated public grievance that the department must respond to.',
    artifactType: 'PORTAL_GRIEVANCE',
    waitDays: 30,
    publicRuleNote: 'A dated grievance is what makes the next step possible. Keep every reference number.',
  },
  {
    id: 'RTI',
    label: 'RTI to the state nodal department',
    canDo: 'Compels a written answer about your own application: where it is, and what was recorded.',
    artifactType: 'RTI_DRAFT',
    waitDays: 30,
    publicRuleNote: 'The right to information covers records about your own application. Fees and formats are publicly published and vary by state.',
  },
];

export const BANK_LADDER: Rung[] = [
  {
    id: 'BANK_BRANCH',
    label: 'Bank branch',
    canDo: 'Can seed and enable the account, reactivate it, or correct the name held on it.',
    artifactType: 'BANK_DBT_REQUEST',
    waitDays: 7,
    publicRuleNote: 'Branches handle seeding, enablement and reactivation at the counter. Ask for a dated acknowledgement.',
  },
  {
    id: 'BANK_NODAL',
    label: 'Bank nodal officer',
    canDo: 'Handles complaints the branch did not resolve, in writing, against a complaint number.',
    artifactType: 'BANK_DBT_REQUEST',
    waitDays: 30,
    publicRuleNote: 'Every bank publishes a nodal officer for customer complaints. The commonly published waiting period before the ombudsman is about a month.',
  },
  {
    id: 'BANK_OMBUDSMAN',
    label: 'Banking ombudsman',
    canDo: 'Independent route once the bank has had its chance to answer and did not.',
    artifactType: 'PORTAL_GRIEVANCE',
    waitDays: 30,
    publicRuleNote: 'The ombudsman route is publicly documented and normally requires that you complained to the bank first and waited the published period.',
  },
];

export function ladderFor(hypothesisId: string): Rung[] {
  const h = getHypothesis(hypothesisId);
  return h.whoMustAct === 'STUDENT_AND_BANK' ? BANK_LADDER : SCHEME_LADDER;
}

export function firstRung(hypothesisId: string): Rung {
  return ladderFor(hypothesisId)[0]!;
}

export function nextRung(hypothesisId: string, currentRungId: string | null): Rung | null {
  const ladder = ladderFor(hypothesisId);
  if (!currentRungId) return ladder[0]!;
  const i = ladder.findIndex((r) => r.id === currentRungId);
  if (i < 0) return ladder[0]!;
  return ladder[i + 1] ?? null;
}

export function rungById(id: string): Rung | null {
  return [...SCHEME_LADDER, ...BANK_LADDER].find((r) => r.id === id) ?? null;
}
