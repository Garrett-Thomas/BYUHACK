import type { Job } from '../types';
import { FALLBACK_JOBS } from '../data/constants';

export interface LoadedJobs {
  jobs: Job[];
  repoCount: number;
  generatedAt: Date | null;
}

export async function loadJobs(): Promise<LoadedJobs> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}jobs.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json() as { jobs?: Job[]; repos?: unknown[]; generatedAt?: string };
    if (!Array.isArray(payload.jobs) || payload.jobs.length === 0) throw new Error('empty feed');
    return {
      jobs: payload.jobs,
      repoCount: Array.isArray(payload.repos) ? payload.repos.length : 4,
      generatedAt: payload.generatedAt ? new Date(payload.generatedAt) : null,
    };
  } catch (e) {
    console.warn('Could not load data/jobs.json, using fallback listings.', e);
    return { jobs: FALLBACK_JOBS, repoCount: 4, generatedAt: null };
  }
}
