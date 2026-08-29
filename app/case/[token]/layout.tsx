import Link from 'next/link';
import { DemoChip, Page } from '@/components/Chrome';
import { CopyLinkRow } from '@/components/CopyLinkRow';
import { RememberCase } from '@/components/RememberCase';
import { baseUrl, loadCase } from '@/lib/case-page';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '', label: 'What we understood' },
  { href: '/questions', label: 'Questions' },
  { href: '/diagnosis', label: 'Diagnosis' },
  { href: '/actions', label: 'What to do' },
  { href: '/verify', label: 'Check again' },
  { href: '/timeline', label: 'History' },
];

export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cwr = await loadCase(token);

  return (
    <Page>
      <RememberCase token={token} label={cwr.case.isDemo ? `Demo case ${cwr.case.demoCaseNo}` : 'My case'} />
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <Link href="/" style={{ fontWeight: 600, textDecoration: 'none' }}>Scholarship Saathi</Link>
        {cwr.case.isDemo ? <DemoChip /> : null}
        <span className="mono" style={{ fontSize: '0.8125rem', color: 'var(--color-slate)' }}>{token}</span>
      </div>
      <CopyLinkRow url={`${baseUrl()}/case/${token}`} />
      <nav className="no-print" aria-label="Case sections" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '1rem 0', fontSize: '0.875rem' }}>
        {TABS.map((t) => (
          <Link key={t.label} href={`/case/${token}${t.href}`}>{t.label}</Link>
        ))}
      </nav>
      {children}
    </Page>
  );
}
