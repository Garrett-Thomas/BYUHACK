import type { Mutual, Profile } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// /api/v1 connection record (see connections-finder/spec.md)
export interface ApiConnection {
  id: string;
  source: string;
  sourceProfileUrl: string;
  name: string;
  headline: string | null;
  company: string | null;
  location: string | null;
  notes: string | null;
  degree: '1st' | '2nd' | '3rd' | null;
  tags: string[];
  mutuals: Mutual[];
  mutualCount: number | null;
  capturedAt: string;
  extractorVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionsPage {
  data: ApiConnection[];
  pagination: { limit: number; offset: number; total: number };
}

export interface CompanyScope {
  company: string;
  linkedinSlug: string | null;
  linkedinName: string | null;
  linkedinIds: string[];
  resolvedAt: string;
}

export interface JobInfo { company: string; role: string; location: string; term: string }
export interface FoundContact { email?: string; label?: string }
export interface DraftInfo extends JobInfo, Profile { email: string; label: string }
export interface Draft { subject: string; body: string }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Could not reach the Warmline server');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: unknown } | null)?.error;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : 'Request failed (' + res.status + ')');
  }
  return body as T;
}

const post = <T>(url: string, info: object) => request<T>(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info),
});

export const getConnections = (company: string) =>
  request<ConnectionsPage>('/api/v1/companies/' + encodeURIComponent(company) + '/connections?limit=100');
const scopeUrl = (company: string) => '/api/v1/company-scopes/' + encodeURIComponent(company);

// 404 means no scope saved yet.
export const getCompanyScope = (company: string) =>
  request<CompanyScope>(scopeUrl(company)).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
// 404 means it was already gone, which is what the caller wanted.
export const deleteCompanyScope = (company: string) =>
  request<null>(scopeUrl(company), { method: 'DELETE' }).then(() => {}, (e: unknown) => {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  });
export const findContact = (info: JobInfo) => post<FoundContact>('/api/find-contact', info);
export const draftEmail = (info: DraftInfo) => post<Draft>('/api/draft-email', info);
