import Link from 'next/link';

export const DISCLOSURE_LINE = 'Independent prototype — not an official government service.';
export const SYNTHETIC_LINE =
  'Synthetic demo data. No live government, banking, Aadhaar, PFMS or NPCI system is connected.';

/** Fixed, on every route, never dismissible. */
export function DisclosureStrip() {
  return (
    <div
      className="no-print"
      style={{
        background: 'var(--color-ink)', color: '#fff', fontSize: 13, lineHeight: '32px',
        minHeight: 32, padding: '0 12px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 40,
      }}
    >
      {DISCLOSURE_LINE}
    </div>
  );
}

export function SyntheticNote() {
  return (
    <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-soft)', margin: '0.5rem 0' }}>{SYNTHETIC_LINE}</p>
  );
}

export function FallbackBanner() {
  return (
    <div
      className="no-print"
      role="status"
      style={{
        background: '#FCF4E6', color: '#5C3B08', borderBottom: '1px solid var(--color-unknown)',
        fontSize: 14, padding: '8px 12px', textAlign: 'center',
      }}
    >
      Running in offline rules mode — answers are based on our built-in rules only.
    </div>
  );
}

export function DemoChip() {
  return (
    <span
      title="This case uses a fictional student and synthetic records."
      style={{
        fontSize: 12, fontWeight: 600, border: '1px solid var(--color-unknown)', color: 'var(--color-unknown)',
        borderRadius: 'var(--radius-chip)', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.03em',
      }}
    >
      Demo mode
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print" style={{ borderTop: '1px solid var(--color-line)', marginTop: '3rem', padding: '1.5rem 0', fontSize: '0.875rem' }}>
      <nav style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <Link href="/about">About</Link>
        <Link href="/about#honesty">Honesty and limitations</Link>
        <Link href="/about#sources">Where our rules come from</Link>
        <Link href="/demo">Demo cases</Link>
      </nav>
      <p style={{ color: 'var(--color-slate)', marginTop: '0.75rem' }}>
        No cookies, no analytics, no trackers. Cases are deleted after 7 days.
      </p>
    </footer>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>{children}</main>;
}
