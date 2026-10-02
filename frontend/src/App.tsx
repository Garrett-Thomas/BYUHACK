import { useEffect, useState } from 'react';
import type { Branch, Contact, Email, Job, JobData, Profile, Screen } from './types';
import { DEFAULT_PROFILE } from './data/constants';
import { loadJobs } from './lib/loadJobs';
import { useCollector } from './hooks/useCollector';
import { usePersistentState } from './hooks/usePersistentState';
import Header from './components/Header';
import Footer from './components/Footer';
import JobsScreen from './screens/JobsScreen';
import CompanyScreen from './screens/CompanyScreen';
import JobDetailScreen from './screens/JobDetailScreen';
import ProfileScreen from './screens/ProfileScreen';

// Revivers for persisted state: anything malformed falls back to the default.
const SCREENS: Screen[] = ['jobs', 'company', 'job', 'profile'];
const asScreen = (v: unknown) => (SCREENS.includes(v as Screen) ? (v as Screen) : undefined);
const asString = (v: unknown) => (typeof v === 'string' ? v : undefined);
const asStrings = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined);
const asProfile = (v: unknown): Profile | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const pick = (k: keyof Profile) => (typeof o[k] === 'string' ? (o[k] as string) : DEFAULT_PROFILE[k]);
  return { name: pick('name'), school: pick('school'), highlight: pick('highlight'), resume: pick('resume') };
};
// Keep finished jobs (edited notes, statuses, found emails). Anything that was in flight when the
// page unloaded can't finish, so clear its busy flag instead of leaving "Searching…" stuck forever.
const asData = (v: unknown): Record<string, JobData> | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, JobData> = {};
  for (const [id, d] of Object.entries(v as Record<string, JobData>)) {
    if (d?.status === 'done' && Array.isArray(d.contacts)) out[id] = { ...d, busy: { contacts: false, email: false } };
  }
  return out;
};

export default function App() {
  const [screen, setScreen] = usePersistentState<Screen>('screen', 'jobs', asScreen);
  const [jobId, setJobId] = usePersistentState<string | null>('jobId', null, asString);
  const [prevScreen, setPrevScreen] = usePersistentState<Screen>('prevScreen', 'jobs', asScreen);
  const [query, setQuery] = usePersistentState('query', '', asString);
  const [companyFilters, setCompanyFilters] = usePersistentState<string[]>('companyFilters', [], asStrings);
  const [locationFilters, setLocationFilters] = usePersistentState<string[]>('locationFilters', [], asStrings);
  const [termFilters, setTermFilters] = usePersistentState<string[]>('termFilters', [], asStrings);
  const [companyJobs, setCompanyJobs] = usePersistentState<Job[]>('companyJobs', [],
    (v) => (Array.isArray(v) ? (v as Job[]) : undefined));
  const [data, setData] = usePersistentState<Record<string, JobData>>('jobData', {}, asData);
  const [profile, setProfile] = usePersistentState<Profile>('profile', { ...DEFAULT_PROFILE }, asProfile);
  const [showRepo, setShowRepo] = usePersistentState('showRepo', true, (v) => (typeof v === 'boolean' ? v : undefined));

  const [jobs, setJobs] = useState<Job[]>([]);
  const [repoCount, setRepoCount] = useState(4);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { retry, ensureIdle, sync } = useCollector(setData);

  useEffect(() => {
    let cancelled = false;
    loadJobs().then((r) => {
      if (cancelled) return;
      setJobs(r.jobs);
      setRepoCount(r.repoCount);
      setGeneratedAt(r.generatedAt);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const findJob = (id: string | null) => jobs.concat(companyJobs).find((j) => j.id === id);

  function go(s: Screen) {
    setScreen(s);
    window.scrollTo(0, 0);
  }

  function openJob(job: Job, from: Screen = 'jobs') {
    setScreen('job');
    setJobId(job.id);
    setPrevScreen(from);
    window.scrollTo(0, 0);
  }

  function companySearch(rawName: string) {
    const name = (rawName || '').trim();
    if (!name) return;
    const id = 'co-' + name.toLowerCase().replace(/\s+/g, '-');
    let job = companyJobs.find((j) => j.id === id);
    if (!job) {
      job = { id, company: name, role: 'General referral', location: 'Any location',
        posted: '', repo: '', term: '', hasListing: false };
      setCompanyJobs([job, ...companyJobs]);
    }
    openJob(job, 'company');
  }

  const updateContact = (id: string, contactId: string, patch: Partial<Contact>) =>
    setData((prev) => {
      const d = prev[id];
      if (!d || d.status !== 'done') return prev;
      return { ...prev, [id]: { ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c)) } };
    });

  const updateEmail = (id: string, patch: Partial<Email>) =>
    setData((prev) => {
      const d = prev[id];
      if (!d || d.status !== 'done' || !d.email || d.email === 'idle') return prev;
      return { ...prev, [id]: { ...d, email: { ...d.email, ...patch } } };
    });

  if (!loaded) return null;

  const job = screen === 'job' ? findJob(jobId) : undefined;
  const current: Screen = screen === 'job' && !job ? 'jobs' : screen;

  return (
    <div className="shell">
      <Header screen={current} prevScreen={prevScreen} name={profile.name} go={go} />
      <main className="wrap" id="view">
        {current === 'jobs' && (
          <JobsScreen jobs={jobs} repoCount={repoCount} generatedAt={generatedAt} data={data}
            showRepo={showRepo} query={query} companyFilters={companyFilters}
            locationFilters={locationFilters} termFilters={termFilters}
            onQuery={setQuery} onCompanyFilters={setCompanyFilters}
            onLocationFilters={setLocationFilters} onTermFilters={setTermFilters}
            onOpen={(j) => openJob(j, 'jobs')} onCompanySearch={companySearch} go={go} />
        )}
        {current === 'company' && (
          <CompanyScreen companyJobs={companyJobs} data={data} onSearch={companySearch}
            onOpen={(j) => openJob(j, 'company')} />
        )}
        {current === 'job' && job && (
          <JobDetailScreen job={job} d={data[job.id]} prevScreen={prevScreen} profile={profile} go={go}
            onRetry={(b: Branch) => retry(job, profile, b)}
            onFind={() => ensureIdle(job)} onSync={() => sync(job, profile)}
            onContact={(contactId, patch) => updateContact(job.id, contactId, patch)}
            onEmail={(patch) => updateEmail(job.id, patch)} />
        )}
        {current === 'profile' && (
          <ProfileScreen profile={profile} onChange={(patch) => setProfile((p) => ({ ...p, ...patch }))} />
        )}
      </main>
      {current === 'jobs' && <Footer showRepo={showRepo} onShowRepo={setShowRepo} />}
    </div>
  );
}
