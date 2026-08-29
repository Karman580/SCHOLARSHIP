import { getRepo } from '@/lib/db/repo';
import { loadCase } from '@/lib/case-page';
import { runDiagnosis } from '@/lib/service';
import { DiagnosisView } from '@/components/Diagnosis';

export const dynamic = 'force-dynamic';

export default async function DiagnosisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repo = getRepo();
  let cwr = await loadCase(token);

  if (!cwr.diagnosis) {
    // Knowing nothing is a real answer, not a dead end: the engine falls back to its
    // priors, the band comes out LOW, and the plan becomes the single check that would
    // separate the two leading possibilities. Refusing to diagnose here would hide that.
    await runDiagnosis(repo, cwr.case);
    if (cwr.case.state === 'DIAGNOSED' || cwr.case.state === 'QUESTIONING' || cwr.case.state === 'EXTRACTED') {
      await repo.setCaseState(cwr.case.id, 'ACTION_PLANNED');
    }
    cwr = await loadCase(token);
  }

  const d = cwr.diagnosis!;
  return (
    <DiagnosisView
      token={token}
      band={d.band}
      verdictText={d.verdictText}
      ranked={d.ranked}
      known={d.known}
      unknown={d.unknown}
      journey={d.journey}
    />
  );
}
