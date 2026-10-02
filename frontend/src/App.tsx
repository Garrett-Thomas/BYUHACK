import { useEffect, useRef, useState } from 'react';
import type { Branch, Contact, Email, Job, JobData, Profile, Screen } from './types';
import { DEFAULT_PROFILE } from './data/constants';
import { loadJobs } from './lib/loadJobs';
import { draftContact, profileKey } from './lib/drafting';
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
// Data saved before the `edited` flags existed counts as edited (the one-time pass in App clears it
// for texts that still match a fresh draft); an email with no profileKey is taken as current.
const asData = (v: unknown, key: string): Record<string, JobData> | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, JobData> = {};
  for (const [id, d] of Object.entries(v as Record<string, JobData>)) {
    if (d?.status !== 'done' || !Array.isArray(d.contacts)) continue;
    const contacts = d.contacts.map((c) => ({ ...c, edited: typeof c.edited === 'boolean' ? c.edited : true }));
    const e = d.email;
    const email = e && e !== 'idle'
      ? { ...e, profileKey: typeof e.profileKey === 'string' ? e.profileKey : key, edited: typeof e.edited === 'boolean' ? e.edited : true }
      : e;
    out[id] = { ...d, contacts, email, busy: { contacts: false, email: false } };
  }
  return out;
};

// Applies `fn` to every contact in every job (jobs list and company searches alike), where `fresh` is
// the draft for the current profile. Returns `prev` untouched if no contact changed.
const reviseContacts = (
  prev: Record<string, JobData>, find: (id: string) => Job | undefined, p: Profile,
  fn: (c: Contact, fresh: string) => Partial<Contact> | null,
) => {
  let next = prev;
  for (const [id, d] of Object.entries(prev)) {
    const job = find(id);
    if (!job) continue;
    let hit = false;
    const contacts = d.contacts.map((c) => {
      const patch = fn(c, draftContact(c, job, p));
      if (!patch) return c;
      hit = true;
      return { ...c, ...patch };
    });
    if (hit) next = { ...next, [id]: { ...d, contacts } };
  }
  return next;
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
  const [profile, setProfile] = usePersistentState<Profile>('profile', { ...DEFAULT_PROFILE }, asProfile);
  const [data, setData] = usePersistentState<Record<string, JobData>>('jobData', {}, (v) => asData(v, profileKey(profile)));
  const [showRepo, setShowRepo] = usePersistentState('showRepo', true, (v) => (typeof v === 'boolean' ? v : undefined));

  const [jobs, setJobs] = useState<Job[]>([]);
  const [repoCount, setRepoCount] = useState(4);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { retry, redraftEmail, ensureIdle, sync } = useCollector(setData);

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
  const findRef = useRef(findJob);
  findRef.current = findJob;

  // One-time pass once jobs are loaded: contacts revived as "edited" whose text still equals a fresh
  // draft for the current profile were never touched, so let them follow the profile again.
  useEffect(() => {
    if (!loaded) return;
    setData((prev) => reviseContacts(prev, findRef.current, profile, (c, fresh) => (c.edited && c.text === fresh ? { edited: false } : null)));
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drafts follow the profile: 400ms after the name/school/highlight settle, redraft every contact
  // whose text was never edited. Functional update, so it can't clobber concurrent changes.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      setData((prev) => reviseContacts(prev, findRef.current, profile, (c, fresh) => (!c.edited && c.text !== fresh ? { text: fresh } : null)));
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, profile.name, profile.school, profile.highlight]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // A changed text counts as the user's edit (typing or an AI rewrite) unless the patch says
  // `edited` itself, as redrafts ("Ask … instead", "Reset to draft") do.
  const updateContact = (id: string, contactId: string, patch: Partial<Contact>) =>
    setData((prev) => {
      const d = prev[id];
      if (!d || d.status !== 'done') return prev;
      const p = 'text' in patch && patch.edited === undefined ? { ...patch, edited: true } : patch;
      return { ...prev, [id]: { ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, ...p } : c)) } };
    });

  const updateEmail = (id: string, patch: Partial<Email>) =>
    setData((prev) => {
      const d = prev[id];
      if (!d || d.status !== 'done' || !d.email || d.email === 'idle') return prev;
      const p = ('subject' in patch || 'text' in patch) && patch.edited === undefined ? { ...patch, edited: true } : patch;
      return { ...prev, [id]: { ...d, email: { ...d.email, ...p } } };
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
            onRedraftEmail={() => {
              const d = data[job.id];
              if (d?.status === 'done' && d.email && d.email !== 'idle') redraftEmail(job, profile, d.email);
            }}
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
