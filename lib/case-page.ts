import { notFound } from 'next/navigation';
import { getRepo } from './db/repo';
import type { CaseWithRelations } from './types';

export async function loadCase(token: string): Promise<CaseWithRelations> {
  const cwr = await getRepo().getCaseByToken(token);
  if (!cwr) notFound();
  return cwr;
}

export function baseUrl(): string {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}
