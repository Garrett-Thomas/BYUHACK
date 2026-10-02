import { useEffect, useState } from 'react';
import type { Branch, Contact, Email, Job, JobData, Profile, Screen } from './types';
import { DEFAULT_PROFILE } from './data/constants';
import { loadJobs } from './lib/loadJobs';
import { useCollector } from './hooks/useCollector';
import Header from './components/Header';
import Footer from './components/Footer';
import JobsScreen from './screens/JobsScreen';
import CompanyScreen from './screens/CompanyScreen';
import JobDetailScreen from './screens/JobDetailScreen';
import ProfileScreen from './screens/ProfileScreen';

export default function App() {
  const [screen, setScreen] = useState<Screen>('jobs');
  const [jobId, setJobId] = useState<string | null>(null);
  const [prevScreen, setPrevScreen] = useState<Screen>('jobs');
  const [query, setQuery] = useState('');
  const [companyFilters, setCompanyFilters] = useState<string[]>([]);
  const [locationFilters, setLocationFilters] = useState<string[]>([]);
  const [termFilters, setTermFilters] = useState<string[]>([]);
  const [companyJobs, setCompanyJobs] = useState<Job[]>([]);
  const [data, setData] = useState<Record<string, JobData>>({});
  const [profile, setProfile] = useState<Profile>({ ...DEFAULT_PROFILE });
  const [showRepo, setShowRepo] = useState(true);

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
