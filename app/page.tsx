import Link from 'next/link';
import { JourneyRail, BLANK_RAIL } from '@/components/JourneyRail';
import { Page, SiteFooter, SyntheticNote } from '@/components/Chrome';

const SYMPTOMS = [
  { text: 'Status says sanctioned, nothing in my account', prefill: 'My scholarship status says sanctioned but nothing has come to my account.' },
  { text: 'College says it is approved, portal says under process', prefill: 'My college says my scholarship is approved but the portal still shows under process.' },
  { text: 'Money came for my friend, not for me', prefill: 'My classmates on the same scholarship have been paid but I have not received anything.' },
];

export default function Landing() {
  return (
    <Page>
      <section className="measure">
        <h1 style={{ fontSize: 'var(--text-3xl)', margin: '1rem 0 0.5rem' }}>
          Your scholarship says approved. The money hasn&rsquo;t come.
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--color-ink-soft)' }}>
          Find out which step is actually stuck, and what to do about it — in about five minutes.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
          <Link className="btn btn-primary" href="/start">Check my case</Link>
          <Link className="btn btn-secondary" href="/demo">See a demo case</Link>
        </div>
        <SyntheticNote />
      </section>

      <section className="card fade" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginTop: 0 }}>The payment journey</h2>
        <JourneyRail stages={BLANK_RAIL} />
        <p style={{ color: 'var(--color-slate)', fontSize: '0.875rem', marginBottom: 0 }}>
          This is what you can see today. Only the first two stages are visible on the portal. The dashed
          line means nobody can see that stage from where you stand.
        </p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: 'var(--text-xl)' }}>Which one sounds like you?</h2>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {SYMPTOMS.map((s) => (
            <Link
              key={s.text}
              className="card"
              href={`/start?prefill=${encodeURIComponent(s.prefill)}`}
              style={{ padding: '1rem', textDecoration: 'none', color: 'var(--color-ink)', fontWeight: 600 }}
            >
              {s.text}
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginTop: '2rem', display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>What this does</h2>
          <ul style={{ paddingLeft: '1.1rem', color: 'var(--color-ink-soft)' }}>
            <li>Names the likely blockers and ranks them honestly.</li>
            <li>Says what we don&rsquo;t know, and how you can find out.</li>
            <li>Gives you one specific thing to do this week.</li>
            <li>Writes the letter, grievance or RTI you need to send.</li>
            <li>Records what happened, so the next step is provable.</li>
          </ul>
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>What it does not do</h2>
          <ul style={{ paddingLeft: '1.1rem', color: 'var(--color-ink-soft)' }}>
            <li>It does not read any real government record. It cannot.</li>
            <li>It does not submit anything anywhere. You send it.</li>
            <li>It does not move money or change any government record.</li>
            <li>It never asks for your Aadhaar number, full account number, or an OTP.</li>
            <li>It does not promise the money will arrive.</li>
          </ul>
        </div>
      </section>

      <SiteFooter />
    </Page>
  );
}
