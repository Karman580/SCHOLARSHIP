import { Page, SiteFooter, SYNTHETIC_LINE } from '@/components/Chrome';
import { HYPOTHESES } from '@/lib/engine/hypotheses';

export const metadata = { title: 'About — Scholarship Saathi' };

export default function AboutPage() {
  return (
    <Page>
      <div className="measure">
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>How this works, and what we don&rsquo;t know</h1>
        <p style={{ color: 'var(--color-ink-soft)' }}>{SYNTHETIC_LINE}</p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>The problem</h2>
        <p>
          A scholarship portal, the payment system and the routing layer that decides which bank account a
          benefit reaches are separate systems with separate truth, and only the first one talks to the
          student. Sanction status is optimistic: it is set when a sanction is issued, not when money
          lands. Every failure after that is silent from where the student stands.
        </p>
        <p>
          A prettier status page cannot help, because the portal does not hold the failing fact. The value
          here is cross-system reasoning under uncertainty plus a concrete artifact — a redesign of one
          system cannot produce either.
        </p>

        <h2 id="sources" style={{ fontSize: 'var(--text-xl)' }}>Where our rules come from</h2>
        <ul>
          <li>
            A CAG performance audit of a state Post-Matric Scholarship DBT programme (Report No. 2 of 2023,
            Odisha) found 2,41,870 beneficiary bank accounts not Aadhaar-seeded, with a dedicated section on
            management of failed transactions — dormant or inactive accounts, and credits to incorrect
            accounts. We do not quote a percentage, because the denominator is unverified in our sources.
          </li>
          <li>
            A state tribal-welfare notification recorded 1,983 ST students rejected under the DBT error
            reasons &ldquo;UID never enabled for DBT&rdquo; and &ldquo;UID disabled for DBT&rdquo;.
          </li>
          <li>
            State-level press reporting has described lakh-scale scholarship non-payment episodes. Those are
            secondary estimates and we treat them as such. They are not national totals.
          </li>
        </ul>

        <h2 id="honesty" style={{ fontSize: 'var(--text-xl)' }}>What is real</h2>
        <p>
          The failure states, the escalation ladder and the &ldquo;how to check&rdquo; steps are drawn from
          publicly documented scheme and banking processes. The reasoning about which failure you are in is
          ours.
        </p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>What is simulated</h2>
        <p>
          Every application, payment, routing and bank record in this prototype is fictional and generated
          by us. Verification reads our own synthetic records. The credit shown at the end of a demo case
          is not a real payment. There is no Aadhaar number anywhere in this codebase, its seed data, its
          fixtures or its tests — the routing layer uses a synthetic alias key instead.
        </p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>What is inferred</h2>
        <p>
          Facts marked <em>Our estimate</em> were worked out by a language model from what you wrote or from
          a screenshot. They can be wrong. You can edit any of them, and your edit always wins.
        </p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>What we don&rsquo;t know</h2>
        <p>
          There is no verified national statistic for how many scholarship payments fail at the
          Aadhaar-seeding or payment-routing stage. Our understanding rests on state audit findings and
          state notifications, which are real but local. Our probability weights are product judgement, not
          measured frequencies. We say this because a tool that guesses about your money should be clear
          about what it is guessing with.
        </p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>Where the model is genuinely necessary</h2>
        <ol>
          <li><strong>Uncontrolled input.</strong> &ldquo;clg ne verify kar diya but portal pe abhi bhi under process&rdquo; is not parseable by a form.</li>
          <li><strong>Screenshots.</strong> Students send images, not text. Reading a cropped status table from a photo is not a deterministic task.</li>
          <li><strong>Explaining uncertainty in your own terms.</strong> Turning &ldquo;two possibilities within 0.1&rdquo; into &ldquo;we can&rsquo;t tell yet — this one check separates them&rdquo; is language work.</li>
          <li><strong>Artifact drafting.</strong> Every letter differs by scheme, elapsed time, what was already tried, and which rung of the ladder you are on.</li>
        </ol>
        <p>
          And where it is not necessary, stated equally plainly: the diagnosis logic, the confidence, the
          state machine and the mock records are all deterministic, because they must be reproducible and
          auditable. The model never decides which failure you are in.
        </p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>The failure states we separate</h2>
        <ul>
          {HYPOTHESES.map((h) => <li key={h.id}>{h.label}</li>)}
        </ul>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>What we would need for production</h2>
        <ul>
          <li>An approved sandbox or API access to the scholarship portal for application and sanction status.</li>
          <li>An approved integration with the payment system for payment record and return reason.</li>
          <li>A bank-side or routing-layer status check for account seeding and DBT enablement, or a student-consented lookup.</li>
          <li>A verified identity flow, which this prototype deliberately does not implement.</li>
        </ul>
        <p>
          Until those exist, this app is a diagnostic and drafting assistant operating on what you can see
          and tell us — and it says so on every screen.
        </p>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>Privacy</h2>
        <ul>
          <li>No login, no account, no cookies, no analytics, no third-party scripts, no trackers.</li>
          <li>Numbers shaped like an Aadhaar number, a bank account number, an OTP or a PAN are stripped on every write path, on your device and again on our server.</li>
          <li>Uploaded images are held in memory for one request and then discarded. There is no file storage in this application.</li>
          <li>Your case link is unguessable but not secret. Anyone with the link can see the case.</li>
          <li>Cases are deleted after 7 days.</li>
          <li>Rate limiting is per server instance, which is enough for a prototype and would not be enough for production.</li>
          <li>Light theme only. Dark mode is out of scope for this prototype.</li>
        </ul>

        <h2 style={{ fontSize: 'var(--text-xl)' }}>Contact</h2>
        <p>Tell us where this is wrong: <a href="mailto:hello@example.invalid">hello@example.invalid</a>.</p>
      </div>
      <SiteFooter />
    </Page>
  );
}
