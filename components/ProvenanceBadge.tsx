import type { Provenance } from '@/lib/types';

const VARIANTS: Record<Provenance, { label: string; border: string; color: string; tooltip: string }> = {
  PUBLIC_RULE: {
    label: 'Public rule',
    border: 'var(--color-note)',
    color: 'var(--color-note)',
    tooltip: 'From publicly documented scheme or banking rules.',
  },
  SIMULATED: {
    label: 'Demo record',
    border: 'var(--color-unknown)',
    color: 'var(--color-unknown)',
    tooltip: "From this prototype's synthetic records. Not a real government record.",
  },
  USER_STATED: {
    label: 'You told us',
    border: 'var(--color-slate)',
    color: 'var(--color-ink-soft)',
    tooltip: 'You entered this.',
  },
  AI_INFERENCE: {
    label: 'Our estimate',
    border: 'var(--color-slate)',
    color: 'var(--color-ink-soft)',
    tooltip: 'Worked out from what you told us. It can be wrong.',
  },
};

/** Required, everywhere. There is no default and no optional marker. */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const v = VARIANTS[provenance];
  return (
    <span
      data-provenance={provenance}
      title={v.tooltip}
      style={{
        display: 'inline-block',
        fontSize: '12px',
        lineHeight: 1.4,
        padding: '1px 6px',
        borderRadius: 'var(--radius-chip)',
        border: `1px solid ${v.border}`,
        color: v.color,
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        fontWeight: 600,
      }}
    >
      {v.label}
    </span>
  );
}

export type FactRowProps = { label: string; value: string; provenance: Provenance; note?: string };

/** A component that renders a value without a provenance will not typecheck. */
export function FactRow({ label, value, provenance, note }: FactRowProps) {
  return (
    <div data-fact-row style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', padding: '0.4rem 0' }}>
      <span style={{ color: 'var(--color-slate)', fontSize: '0.875rem', minWidth: '10rem' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
      <ProvenanceBadge provenance={provenance} />
      {note ? <span style={{ color: 'var(--color-slate)', fontSize: '0.875rem', width: '100%' }}>{note}</span> : null}
    </div>
  );
}
