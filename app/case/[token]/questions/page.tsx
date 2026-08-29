import { redirect } from 'next/navigation';
import { getRepo } from '@/lib/db/repo';
import { loadCase } from '@/lib/case-page';
import { nextQuestion } from '@/lib/service';
import { QuestionFlow } from '@/components/QuestionFlow';

export const dynamic = 'force-dynamic';

export default async function QuestionsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cwr = await loadCase(token);
  const nq = await nextQuestion(getRepo(), cwr.case);
  if (!nq.question) redirect(`/case/${token}/diagnosis`);

  return (
    <QuestionFlow
      token={token}
      askedCount={nq.askedCount}
      question={{
        id: nq.question.id,
        prompt: nq.question.prompt,
        why: nq.question.why,
        options: nq.question.options,
        howToCheck: nq.question.howToCheck,
      }}
    />
  );
}
