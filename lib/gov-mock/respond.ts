import { NextResponse } from 'next/server';
import { SIMULATED_DISCLAIMER } from './client';

const FAILURE_RATE = () => Number(process.env.MOCK_FAILURE_RATE ?? 0);

/** Honest loading states need honest latency. 150-450ms, plus an optional failure rate. */
async function delay(): Promise<void> {
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 300));
}

export async function simulatedJson(payload: Record<string, unknown> | null): Promise<NextResponse> {
  await delay();
  if (Math.random() < FAILURE_RATE()) {
    return NextResponse.json(
      { simulated: true, disclaimer: SIMULATED_DISCLAIMER, found: false, note: 'Simulated outage.' },
      { status: 200, headers: { 'X-Saathi-Simulated': 'true' } },
    );
  }
  const body = payload
    ? { simulated: true, disclaimer: SIMULATED_DISCLAIMER, found: true, ...payload }
    : { simulated: true, disclaimer: SIMULATED_DISCLAIMER, found: false };
  return NextResponse.json(body, { status: 200, headers: { 'X-Saathi-Simulated': 'true' } });
}
