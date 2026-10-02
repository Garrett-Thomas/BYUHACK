import { baseUrl } from './settings';

const SAVE_TIMEOUT_MS = 10000;

export interface CompanyScopeInput {
  linkedinSlug: string | null;
  linkedinName: string | null;
  linkedinIds: string[];
}

/** PUT /api/v1/company-scopes/:company. True only on a 200 (the user is waiting, so no retry queue). */
export async function putCompanyScope(serverUrl: string, company: string, scope: CompanyScopeInput): Promise<boolean> {
  const base = baseUrl(serverUrl);
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/v1/company-scopes/${encodeURIComponent(company)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scope),
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
