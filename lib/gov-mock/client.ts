/**
 * The single integration seam. In production this module would be replaced by
 * authenticated clients for the corresponding real systems, subject to an approved
 * sandbox. Nothing else in the app knows the /api/gov URLs.
 */
import type { GovAccount, GovApplication, GovMapping, GovPayment } from '../types';

export const SIMULATED_DISCLAIMER = 'Synthetic record from a prototype. Not a government record.';

type Envelope<T> = { simulated: boolean; disclaimer?: string; found?: boolean } & Partial<T>;

async function get<T>(baseUrl: string, path: string, params: Record<string, string>): Promise<Envelope<T>> {
  const url = new URL(`/api/gov/${path}`, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json()) as Envelope<T>;
  // A real API could never be silently swapped in behind a UI that claims to be simulated.
  if (body.simulated !== true || (body.found !== false && !body.disclaimer)) {
    throw new Error('Government-shaped response was not marked simulated. Refusing to use it.');
  }
  return body;
}

export function govClient(baseUrl: string) {
  return {
    async getApplication(applicationId: string): Promise<GovApplication | null> {
      const b = await get<GovApplication>(baseUrl, 'nsp/application', { applicationId });
      return b.found === false ? null : (b as unknown as GovApplication);
    },
    async getPayment(applicationId: string): Promise<GovPayment | null> {
      const b = await get<GovPayment>(baseUrl, 'pfms/payment', { applicationId });
      return b.found === false ? null : (b as unknown as GovPayment);
    },
    async getMapping(aliasKey: string): Promise<GovMapping | null> {
      const b = await get<GovMapping>(baseUrl, 'npci/mapper', { aliasKey });
      return b.found === false ? null : (b as unknown as GovMapping);
    },
    async getAccount(bankRefId: string): Promise<GovAccount | null> {
      const b = await get<GovAccount>(baseUrl, 'bank/account', { bankRefId });
      return b.found === false ? null : (b as unknown as GovAccount);
    },
  };
}
