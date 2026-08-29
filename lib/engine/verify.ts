import type { JourneyStage } from '../types';

export type VerifyResult = 'RESOLVED' | 'PROGRESSED' | 'NO_CHANGE' | 'NEEDS_MORE_INFO';

const RANK: Record<JourneyStage['status'], number> = {
  NOT_REACHED: 0,
  UNKNOWN: 1,
  BLOCKED: 1,
  LIKELY: 2,
  CONFIRMED: 3,
};

/**
 * Compares the journey before and after the synthetic records were mutated.
 * Stage 8 CONFIRMED is the only route to RESOLVED (machine.ts enforces the rest).
 */
export function compareJourneys(before: JourneyStage[], after: JourneyStage[]): VerifyResult {
  const beforeById = new Map(before.map((s) => [s.stageId, s]));
  const stage8 = after.find((s) => s.stageId === 8);
  if (stage8?.status === 'CONFIRMED') return 'RESOLVED';

  let advanced = false;
  let newUnknown = false;
  for (const s of after) {
    const prev = beforeById.get(s.stageId);
    if (!prev) continue;
    if (RANK[s.status] > RANK[prev.status]) advanced = true;
    if (s.status === 'UNKNOWN' && prev.status !== 'UNKNOWN' && RANK[s.status] < RANK[prev.status]) newUnknown = true;
  }
  if (advanced) return 'PROGRESSED';
  if (newUnknown) return 'NEEDS_MORE_INFO';
  return 'NO_CHANGE';
}
