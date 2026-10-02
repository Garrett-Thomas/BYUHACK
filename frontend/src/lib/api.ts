import type { Profile } from '../types';

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
  tags: string[];
  capturedAt: string;
  extractorVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionsPage {
  data: ApiConnection[];
  pagination: { limit: number; offset: number; total: number };
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
export const findContact = (info: JobInfo) => post<FoundContact>('/api/find-contact', info);
export const draftEmail = (info: DraftInfo) => post<Draft>('/api/draft-email', info);
