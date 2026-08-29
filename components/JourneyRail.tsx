import type { JourneyStage, JourneyStatus } from '@/lib/types';
import { ProvenanceBadge } from './ProvenanceBadge';

const STATUS_WORD: Record<JourneyStatus, string> = {
  CONFIRMED: 'Confirmed',
  LIKELY: 'Likely',
  UNKNOWN: 'Unknown',
  BLOCKED: 'Blocked here',
  NOT_REACHED: 'Not reached',
};

const COLOR: Record<JourneyStatus, string> = {
  CONFIRMED: 'var(--color-confirmed)',
  LIKELY: 'var(--color-ink-soft)',
  UNKNOWN: 'var(--color-unknown)',
  BLOCKED: 'var(--color-blocked)',
  NOT_REACHED: 'var(--color-line)',
};

const DASHED: JourneyStatus[] = ['UNKNOWN', 'NOT_REACHED'];

/**
 * The marker colour and the label colour are not the same thing: --color-line is a
 * hairline, right for a small dot and unreadable as text.
 */
const LABEL_COLOR: Record<JourneyStatus, string> = { ...COLOR, NOT_REACHED: 'var(--color-slate)' };

function Marker({ status }: { status: JourneyStatus }) {
  const c = COLOR[status];
  if (status === 'CONFIRMED') {
    return (
      <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', background: c, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5l2.5 2.5L9 2" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  }
  if (status === 'BLOCKED') {
    return <span aria-hidden style={{ width: 18, height: 18, background: c, flex: '0 0 auto', borderRadius: 2 }} />;
  }
  if (status === 'LIKELY') {
    return <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', background: c, flex: '0 0 auto' }} />;
  }
  if (status === 'UNKNOWN') {
    return <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${c}`, flex: '0 0 auto' }} />;
  }
  return <span aria-hidden style={{ width: 10, height: 10, margin: 4, borderRadius: '50%', border: `2px solid ${c}`, flex: '0 0 auto' }} />;
}

/**
 * The signature element. The dashed connector is the honesty device: it says nobody
 * can see this stage from where the student stands. An unknown stage is never drawn
 * as confirmed.
 */
export function JourneyRail({ stages, compact = false, animate = false }: { stages: JourneyStage[]; compact?: boolean; animate?: boolean }) {
  return (
    <ol aria-label="Payment journey" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const dashed = DASHED.includes(s.status) || s.status === 'BLOCKED';
        return (
          <li
            key={s.stageId}
            data-stage-status={s.status}
            className={animate ? 'rise' : undefined}
            style={{ display: 'flex', gap: '0.75rem', animationDelay: animate ? `${i * 60}ms` : undefined }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
              <Marker status={s.status} />
              {!last && (
                <span
                  aria-hidden
                  style={{
                    flex: 1,
                    minHeight: compact ? 18 : 26,
                    width: 0,
                    borderLeft: `2px ${dashed ? 'dashed' : 'solid'} ${s.status === 'BLOCKED' ? 'var(--color-line)' : COLOR[s.status]}`,
                    margin: '2px 0',
                  }}
                />
              )}
            </div>
            <div style={{ paddingBottom: compact ? '0.5rem' : '0.9rem', minWidth: 0 }}>
              <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                {`Stage ${s.stageId} of ${stages.length}, ${s.label}, status ${STATUS_WORD[s.status].toLowerCase()}`}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }} aria-hidden>
                <span className="mono" style={{ color: 'var(--color-slate)', fontSize: '0.8125rem' }}>{s.stageId}</span>
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <span style={{ color: LABEL_COLOR[s.status], fontSize: '0.875rem', fontWeight: 600 }}>{STATUS_WORD[s.status]}</span>
                <ProvenanceBadge provenance={s.provenance} />
              </div>
              {s.note && !compact ? (
                <div style={{ color: 'var(--color-slate)', fontSize: '0.875rem' }}>{s.note}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const BLANK_RAIL: JourneyStage[] = [
  { stageId: 1, label: 'Application submitted', status: 'CONFIRMED', provenance: 'PUBLIC_RULE', note: 'You can see this on the portal.' },
  { stageId: 2, label: 'College verification', status: 'CONFIRMED', provenance: 'PUBLIC_RULE', note: 'You can see this on the portal.' },
  { stageId: 3, label: 'State / ministry verification', status: 'UNKNOWN', provenance: 'PUBLIC_RULE' },
  { stageId: 4, label: 'Sanction issued', status: 'UNKNOWN', provenance: 'PUBLIC_RULE' },
  { stageId: 5, label: 'Payment instruction sent', status: 'UNKNOWN', provenance: 'PUBLIC_RULE' },
  { stageId: 6, label: 'Payment system processing', status: 'UNKNOWN', provenance: 'PUBLIC_RULE' },
  { stageId: 7, label: 'Aadhaar-to-bank routing', status: 'UNKNOWN', provenance: 'PUBLIC_RULE' },
  { stageId: 8, label: 'Credit to your account', status: 'UNKNOWN', provenance: 'PUBLIC_RULE' },
];
