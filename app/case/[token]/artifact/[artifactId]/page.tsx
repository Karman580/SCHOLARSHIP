import { notFound } from 'next/navigation';
import { getRepo } from '@/lib/db/repo';
import { loadCase } from '@/lib/case-page';
import { ArtifactPaper } from '@/components/ArtifactPaper';

export const dynamic = 'force-dynamic';

export default async function ArtifactPage({ params }: { params: Promise<{ token: string; artifactId: string }> }) {
  const { token, artifactId } = await params;
  const cwr = await loadCase(token);
  const artifact = await getRepo().getArtifact(cwr.case.id, artifactId);
  if (!artifact) notFound();
  return <ArtifactPaper token={token} artifact={artifact} />;
}
