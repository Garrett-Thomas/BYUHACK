import type { Job } from '../types';
import { FALLBACK_JOBS } from '../data/constants';

export interface LoadedJobs {
  jobs: Job[];
  repoCount: number;
  generatedAt: Date | null;
}

// The scraper numbers jobs by position ("j0", "j1", ...), so ids shift whenever the feed changes.
// Saved per-job state (notes, statuses, emails) is keyed by id, so derive a stable id from what
// identifies the listing instead. Repeats of the same listing get a #2, #3 suffix to stay unique.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function withStableIds(jobs: Job[]): Job[] {
  const seen = new Map<string, number>();
  return jobs.map((j) => {
    const base = 'j-' + hash([j.company, j.role, j.location, j.url ?? ''].join('|').toLowerCase());
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...j, id: n === 1 ? base : base + '#' + n };
  });
}

export async function loadJobs(): Promise<LoadedJobs> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}jobs.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json() as { jobs?: Job[]; repos?: unknown[]; generatedAt?: string };
    if (!Array.isArray(payload.jobs) || payload.jobs.length === 0) throw new Error('empty feed');
    return {
      jobs: withStableIds(payload.jobs),
      repoCount: Array.isArray(payload.repos) ? payload.repos.length : 4,
      generatedAt: payload.generatedAt ? new Date(payload.generatedAt) : null,
    };
  } catch (e) {
    console.warn('Could not load data/jobs.json, using fallback listings.', e);
    return { jobs: withStableIds(FALLBACK_JOBS), repoCount: 4, generatedAt: null };
  }
}
