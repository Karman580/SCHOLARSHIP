import { describe, expect, it } from 'vitest';
import { ALL_EVENTS, canTransition, InvalidTransition, mayResolve, transition } from '@/lib/engine/machine';
import { CASE_STATES, type CaseState } from '@/lib/types';

describe('case state machine', () => {
  it('makes every legal transition and refuses every illegal pair', () => {
    let legal = 0;
    let illegal = 0;
    for (const from of CASE_STATES) {
      for (const event of ALL_EVENTS) {
        if (canTransition(from, event)) {
          expect(() => transition(from, event)).not.toThrow();
          legal++;
        } else {
          expect(() => transition(from, event)).toThrow(InvalidTransition);
          illegal++;
        }
      }
    }
    expect(legal).toBeGreaterThan(0);
    expect(illegal).toBeGreaterThan(0);
  });

  it('reaches RESOLVED only from VERIFYING', () => {
    const reachers = CASE_STATES.filter((from) => {
      try {
        return transition(from, 'VERIFY_RESOLVED').nextState === 'RESOLVED';
      } catch {
        return false;
      }
    });
    expect(reachers).toEqual(['VERIFYING']);
  });

  it('will not resolve without a verification run whose stage 8 is confirmed', () => {
    expect(mayResolve('VERIFYING', true)).toBe(true);
    expect(mayResolve('VERIFYING', false)).toBe(false);
    expect(mayResolve('ACTION_PLANNED' as CaseState, true)).toBe(false);
  });

  it('issues actions as an effect of diagnosis', () => {
    expect(transition('DIAGNOSED', 'ACTIONS_ISSUED').effects).toContain('ISSUE_ACTIONS');
  });

  it('invalidates later answers when a fact is edited', () => {
    expect(transition('DIAGNOSED', 'FACT_EDITED')).toEqual({ nextState: 'QUESTIONING', effects: ['INVALIDATE_ANSWERS'] });
  });
});
