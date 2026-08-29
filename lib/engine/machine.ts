import type { CaseState } from '../types';

export class InvalidTransition extends Error {
  constructor(from: CaseState, event: MachineEvent) {
    super(`Illegal transition: ${from} --${event}-->`);
    this.name = 'InvalidTransition';
  }
}

export type MachineEvent =
  | 'INTAKE_RECEIVED' | 'FACTS_EXTRACTED' | 'HAS_QUESTION' | 'NO_QUESTION' | 'ANSWER_MORE'
  | 'ANSWER_STOP' | 'ACTIONS_ISSUED' | 'ACTION_COMPLETED' | 'VERIFY_SUBMITTED'
  | 'VERIFY_RESOLVED' | 'VERIFY_PROGRESSED' | 'VERIFY_NO_CHANGE' | 'VERIFY_NEEDS_INFO'
  | 'ESCALATE' | 'FACT_EDITED' | 'ABANDON';

export type Effect = 'ISSUE_ACTIONS' | 'RUN_DIAGNOSIS' | 'INVALIDATE_ANSWERS' | 'RECORD_RESOLUTION' | 'OFFER_ESCALATION';

type Rule = { from: CaseState[]; to: CaseState; effects?: Effect[] };

const RULES: Record<MachineEvent, Rule> = {
  INTAKE_RECEIVED: { from: ['NEW'], to: 'INTAKE' },
  FACTS_EXTRACTED: { from: ['INTAKE'], to: 'EXTRACTED' },
  HAS_QUESTION: { from: ['EXTRACTED', 'QUESTIONING', 'NEEDS_MORE_INFO'], to: 'QUESTIONING' },
  NO_QUESTION: { from: ['EXTRACTED', 'QUESTIONING', 'NEEDS_MORE_INFO'], to: 'DIAGNOSED', effects: ['RUN_DIAGNOSIS'] },
  ANSWER_MORE: { from: ['QUESTIONING'], to: 'QUESTIONING' },
  ANSWER_STOP: { from: ['QUESTIONING'], to: 'DIAGNOSED', effects: ['RUN_DIAGNOSIS'] },
  ACTIONS_ISSUED: { from: ['DIAGNOSED'], to: 'ACTION_PLANNED', effects: ['ISSUE_ACTIONS'] },
  ACTION_COMPLETED: { from: ['ACTION_PLANNED', 'AWAITING_VERIFICATION'], to: 'AWAITING_VERIFICATION' },
  VERIFY_SUBMITTED: { from: ['AWAITING_VERIFICATION', 'VERIFYING'], to: 'VERIFYING' },
  VERIFY_RESOLVED: { from: ['VERIFYING'], to: 'RESOLVED', effects: ['RECORD_RESOLUTION'] },
  VERIFY_PROGRESSED: { from: ['VERIFYING'], to: 'ACTION_PLANNED', effects: ['ISSUE_ACTIONS'] },
  VERIFY_NO_CHANGE: { from: ['VERIFYING'], to: 'AWAITING_VERIFICATION', effects: ['OFFER_ESCALATION'] },
  VERIFY_NEEDS_INFO: { from: ['VERIFYING'], to: 'QUESTIONING' },
  ESCALATE: {
    from: ['ACTION_PLANNED', 'AWAITING_VERIFICATION', 'VERIFYING', 'ESCALATED', 'DIAGNOSED'],
    to: 'ESCALATED',
  },
  FACT_EDITED: {
    from: ['EXTRACTED', 'QUESTIONING', 'DIAGNOSED', 'ACTION_PLANNED', 'AWAITING_VERIFICATION', 'NEEDS_MORE_INFO', 'ESCALATED'],
    to: 'QUESTIONING',
    effects: ['INVALIDATE_ANSWERS'],
  },
  ABANDON: {
    from: ['NEW', 'INTAKE', 'EXTRACTED', 'QUESTIONING', 'DIAGNOSED', 'ACTION_PLANNED', 'AWAITING_VERIFICATION', 'VERIFYING', 'NEEDS_MORE_INFO'],
    to: 'ABANDONED',
  },
};

export function canTransition(from: CaseState, event: MachineEvent): boolean {
  return RULES[event]?.from.includes(from) ?? false;
}

export function transition(from: CaseState, event: MachineEvent): { nextState: CaseState; effects: Effect[] } {
  const rule = RULES[event];
  if (!rule || !rule.from.includes(from)) throw new InvalidTransition(from, event);
  return { nextState: rule.to, effects: rule.effects ?? [] };
}

/**
 * The only path to RESOLVED. There is no UI or API that can set it directly:
 * it requires a verification run whose stage 8 is CONFIRMED.
 */
export function mayResolve(from: CaseState, stage8Confirmed: boolean): boolean {
  return from === 'VERIFYING' && stage8Confirmed;
}

export const ALL_EVENTS = Object.keys(RULES) as MachineEvent[];
